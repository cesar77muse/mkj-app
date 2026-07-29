import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shipping-tickets/new")({
  head: () => ({ meta: [{ title: "New Shipping Ticket — MKJ Ops" }] }),
  component: NewTicket,
});

type Line = { product_id: string; description: string; qty_shipped: number; qty_backordered: number };

function NewTicket() {
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects", "active"], queryFn: async () => (await supabase.from("projects").select("id, mkj_number, name").eq("status", "active").order("mkj_number")).data ?? [] });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("id, part_number, description").order("part_number")).data ?? [] });

  const stock = useQuery({
    queryKey: ["inventory", "project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_inventory")
        .select("product_id, on_hand")
        .eq("project_id", projectId);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data ?? []) map.set(r.product_id as string, Number(r.on_hand));
      return map;
    },
  });

  const [projectId, setProjectId] = useState("");
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliverTo, setDeliverTo] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [shipBy, setShipBy] = useState("Van");
  const [contractNum, setContractNum] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", description: "", qty_shipped: 1, qty_backordered: 0 }]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: numRow, error: numErr } = await supabase.rpc("gen_ticket_number");
      if (numErr) throw numErr;
      const { data: user } = await supabase.auth.getUser();
      const { data: t, error } = await supabase.from("shipping_tickets").insert({
        ticket_number: numRow as unknown as string,
        project_id: projectId,
        ship_date: shipDate,
        deliver_to_name: deliverTo || null,
        deliver_to_address: address || null,
        contact_name: contact || null,
        contact_phone: phone || null,
        ship_by: shipBy || null,
        contract_number: contractNum || null,
        status: "ready",
        created_by: user.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      const items = lines.filter((l) => l.product_id && (l.qty_shipped > 0 || l.qty_backordered > 0)).map((l) => ({
        ticket_id: t.id, product_id: l.product_id, description: l.description || products.data?.find((p) => p.id === l.product_id)?.description || "",
        qty_shipped: l.qty_shipped, qty_backordered: l.qty_backordered,
      }));
      if (items.length > 0) {
        const { error: iErr } = await supabase.from("shipping_ticket_items").insert(items);
        if (iErr) throw iErr;
      }
      return t.id as string;
    },
    onSuccess: (id) => {
      toast.success("Ticket created");
      navigate({ to: "/shipping-tickets/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New Shipping Ticket" description="Create a ticket to send items to a job site. Inventory is deducted when you mark it Shipped." />
      <Card><CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.mkj_number} — {p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Ship date</Label><Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
          <div><Label>Deliver to (site name)</Label><Input value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} placeholder="Church Ave Station" /></div>
          <div><Label>Ship by</Label><Input value={shipBy} onChange={(e) => setShipBy(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Delivery address</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>On-site contact</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div><Label>Contact phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Contract #</Label><Input value={contractNum} onChange={(e) => setContractNum(e.target.value)} /></div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Line items</h3>
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { product_id: "", description: "", qty_shipped: 1, qty_backordered: 0 }])}><Plus className="mr-1 h-4 w-4" />Add line</Button>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Product</TableHead><TableHead className="text-right">In stock</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Shipped</TableHead><TableHead className="text-right">Backordered</TableHead><TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select value={l.product_id} onValueChange={(v) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, product_id: v, description: products.data?.find((p) => p.id === v)?.description ?? x.description } : x))}>
                      <SelectTrigger className="h-8 w-52"><SelectValue placeholder="Select part" /></SelectTrigger>
                      <SelectContent>{products.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.part_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {l.product_id ? (() => {
                      const onHand = stock.data?.get(l.product_id) ?? 0;
                      const remaining = onHand - l.qty_shipped;
                      return (
                        <div className="inline-flex flex-col items-end rounded-md border px-2 py-1">
                          <span className={`text-sm font-semibold ${remaining < 0 ? "text-destructive" : ""}`}>{onHand}</span>
                          <span className="text-[10px] text-muted-foreground">{remaining < 0 ? `short ${Math.abs(remaining)}` : `${remaining} left`}</span>
                        </div>
                      );
                    })() : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} /></TableCell>
                  <TableCell><Input type="number" step={1} min={0} inputMode="numeric" className="text-right" value={l.qty_shipped} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, qty_shipped: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : x))} /></TableCell>
                  <TableCell><Input type="number" step={1} min={0} inputMode="numeric" className="text-right" value={l.qty_backordered} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, qty_backordered: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : x))} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/shipping-tickets" })}>Cancel</Button>
          <Button disabled={!projectId || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create ticket"}</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
