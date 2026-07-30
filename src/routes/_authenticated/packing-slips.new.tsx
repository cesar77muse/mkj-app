import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { resolveProductId, syncSlipInventory } from "@/lib/receiving";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({ po: z.string().optional() });

export const Route = createFileRoute("/_authenticated/packing-slips/new")({
  head: () => ({ meta: [{ title: "Receive Shipment — MKJ Ops" }] }),
  validateSearch: searchSchema,
  component: NewSlip,
});

type Line = {
  po_item_id: string | null;
  product_id: string | null;
  part_number: string | null;
  description: string;
  qty_ordered: number;
  qty_already: number;
  qty_received: number;
  condition: string;
};

function NewSlip() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string>("");
  const [poId, setPoId] = useState<string>(search.po ?? "");
  const [poOpen, setPoOpen] = useState(false);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState("");
  const [vendorSlip, setVendorSlip] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const projects = useQuery({
    queryKey: ["projects-for-slip"],
    queryFn: async () => (await supabase.from("projects").select("id, mkj_number, name").order("mkj_number")).data ?? [],
  });

  // Resolve project when arriving via ?po=
  const incomingPo = useQuery({
    queryKey: ["po-project", search.po],
    enabled: !!search.po,
    queryFn: async () => (await supabase.from("purchase_orders").select("id, project_id").eq("id", search.po!).maybeSingle()).data,
  });
  useEffect(() => {
    if (incomingPo.data?.project_id) setProjectId(incomingPo.data.project_id);
  }, [incomingPo.data]);

  const projectPOs = useQuery({
    queryKey: ["pos-open", projectId],
    enabled: !!projectId,
    queryFn: async () => (await supabase
      .from("purchase_orders")
      .select("id, po_number, description, status, suppliers:supplier_id(name)")
      .eq("project_id", projectId)
      .in("status", ["approved", "executed", "partially_received"])
      .order("po_number")).data ?? [],
  });

  const selectedPO = projectPOs.data?.find((p) => p.id === poId) ?? null;

  const poDetail = useQuery({
    queryKey: ["po-detail-for-slip", poId],
    enabled: !!poId,
    queryFn: async () => {
      const [po, items] = await Promise.all([
        supabase.from("purchase_orders").select("id, po_number, project_id, projects:project_id(mkj_number)").eq("id", poId).maybeSingle(),
        supabase.from("purchase_order_items").select("id, description, qty, unit, product_id, products:product_id(part_number)").eq("po_id", poId).order("line_no"),
      ]);
      const itemIds = (items.data ?? []).map((i) => i.id);
      const { data: priorItems } = await supabase
        .from("packing_slip_items")
        .select("po_item_id, qty_received")
        .in("po_item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
      const priorMap = new Map<string, number>();
      (priorItems ?? []).forEach((p) => priorMap.set(p.po_item_id!, (priorMap.get(p.po_item_id!) ?? 0) + Number(p.qty_received)));
      return { po: po.data, items: items.data ?? [], priorMap };
    },
  });

  useEffect(() => {
    if (poDetail.data && poDetail.data.po?.id === poId) {
      setLines(poDetail.data.items.map((it) => {
        const already = poDetail.data!.priorMap.get(it.id) ?? 0;
        const remaining = Math.max(0, Number(it.qty) - already);
        return {
          po_item_id: it.id,
          product_id: it.product_id,
          part_number: it.products?.part_number ?? null,
          description: it.description,
          qty_ordered: Number(it.qty),
          qty_already: already,
          qty_received: remaining,
          condition: "ok",
        };
      }));
    }
  }, [poDetail.data, poId]);

  function pickProject(id: string) {
    setProjectId(id);
    setPoId("");
    setLines([]);
  }

  const summary = useMemo(() => {
    let backorderLines = 0;
    let fullLines = 0;
    let unitsNow = 0;
    for (const l of lines) {
      const total = l.qty_already + l.qty_received;
      unitsNow += l.qty_received;
      if (total < l.qty_ordered) backorderLines += 1;
      else fullLines += 1;
    }
    return { backorderLines, fullLines, unitsNow };
  }, [lines]);

  const create = useMutation({
    mutationFn: async () => {
      if (!poDetail.data?.po) throw new Error("Pick a PO");
      const mkj = poDetail.data.po.projects?.mkj_number as string;
      const { data: numRow, error: numErr } = await supabase.rpc("gen_ps_number", { _mkj: mkj });
      if (numErr) throw numErr;
      const { data: user } = await supabase.auth.getUser();
      const anyBackorder = lines.some((l) => l.qty_already + l.qty_received < l.qty_ordered);
      const slipStatus = anyBackorder ? "partially_received" : "received";
      const { data: slip, error } = await supabase.from("packing_slips").insert({
        slip_number: numRow as unknown as string,
        po_id: poDetail.data.po.id,
        project_id: poDetail.data.po.project_id,
        received_date: receivedDate,
        received_by: user.user?.id ?? null,
        carrier: carrier || null,
        vendor_slip_number: vendorSlip || null,
        notes: notes || null,
        status: slipStatus,
      }).select("id").single();
      if (error) throw error;

      // Resolve (or create) catalog products so received qty always hits inventory,
      // even when the PO line was typed free-hand without a product link.
      const received = lines.filter((l) => l.qty_received > 0);
      const resolved = [] as { line: Line; product_id: string | null }[];
      for (const l of received) {
        resolved.push({
          line: l,
          product_id: await resolveProductId({
            productId: l.product_id,
            partNumber: l.part_number,
            description: l.description,
          }),
        });
      }

      const items = resolved.map(({ line: l, product_id }) => ({
        slip_id: slip.id, po_item_id: l.po_item_id, product_id,
        description: l.description, qty_ordered: l.qty_ordered, qty_received: l.qty_received, condition: l.condition,
      }));
      if (items.length > 0) {
        const { error: iErr } = await supabase.from("packing_slip_items").insert(items);
        if (iErr) throw iErr;
      }

      await syncSlipInventory({
        slipId: slip.id,
        slipNumber: numRow as unknown as string,
        projectId: poDetail.data.po.project_id,
        lines: resolved.map(({ line, product_id }) => ({ product_id, qty_received: line.qty_received })),
        userId: user.user?.id ?? null,
      });

      await supabase.from("purchase_orders").update({ status: slipStatus }).eq("id", poDetail.data.po.id);
      return slip.id as string;
    },
    onSuccess: () => {
      toast.success("Packing slip recorded and inventory updated");
      navigate({ to: "/packing-slips" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Add Packing Slip" description="Log what actually arrived. Inventory updates automatically." />
      <Card><CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Project</Label>
            <Select value={projectId} onValueChange={pickProject}>
              <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent>
                {projects.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.mkj_number} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Purchase Order</Label>
            <Popover open={poOpen} onOpenChange={setPoOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={!projectId}
                  className="w-full justify-between font-normal"
                >
                  {selectedPO ? selectedPO.po_number : projectId ? "Search POs…" : "Pick a project first"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search PO #, supplier, description…" />
                  <CommandList>
                    <CommandEmpty>No open POs found for this project.</CommandEmpty>
                    <CommandGroup>
                      {projectPOs.data?.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.po_number} ${p.suppliers?.name ?? ""} ${p.description ?? ""}`}
                          onSelect={() => { setPoId(p.id); setPoOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", poId === p.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex flex-col">
                            <span className="font-mono text-sm">{p.po_number}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.suppliers?.name ?? "No supplier"}{p.description ? ` · ${p.description}` : ""}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div><Label>Received date</Label><Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} /></div>
          <div><Label>Carrier</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></div>
          <div><Label>Vendor's slip #</Label><Input value={vendorSlip} onChange={(e) => setVendorSlip(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Ordered vs received</h3>
            {lines.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {summary.fullLines} line(s) complete · {summary.backorderLines} with backorder · {summary.unitsNow} unit(s) receiving now
              </p>
            ) : null}
          </div>
          {lines.length > 0 ? (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Part #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Prev. received</TableHead>
                  <TableHead className="text-right">Receiving now</TableHead>
                  <TableHead className="text-right">Total received</TableHead>
                  <TableHead className="text-right">Backordered</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lines.map((l, i) => {
                    const total = l.qty_already + l.qty_received;
                    const backorder = Math.max(0, l.qty_ordered - total);
                    const over = total > l.qty_ordered;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{l.part_number ?? "—"}</TableCell>
                        <TableCell>{l.description}</TableCell>
                        <TableCell className="text-right">{l.qty_ordered}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{l.qty_already}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            className="w-24 text-right"
                            value={l.qty_received}
                            onChange={(e) => {
                              const v = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                              setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, qty_received: v } : x));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {total}
                          {over ? <span className="ml-1 text-xs text-status-partial-foreground">over</span> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {backorder > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-status-partial px-2.5 py-0.5 text-xs font-medium text-status-partial-foreground">
                              {backorder} backordered
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={l.condition} onValueChange={(v) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, condition: v } : x))}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ok">OK</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                {summary.backorderLines > 0
                  ? "Saving will mark this PO as Partially Received — backordered quantities stay open."
                  : "Saving will mark this PO as Received."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {projectId ? "Pick a PO to load its lines." : "Pick a project, then search its purchase orders."}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/packing-slips" })}>Cancel</Button>
          <Button disabled={!poId || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Record shipment"}</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
