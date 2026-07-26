import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { openPOPdf } from "@/lib/po-pdf";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Plus, Trash } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchase-orders/new")({
  head: () => ({ meta: [{ title: "New Purchase Order — MKJ Ops" }] }),
  component: NewPO,
});

type Line = { line_no: number; budget_code: string; description: string; qty: number; unit: string; unit_cost: number };

function NewPO() {
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects", "active"], queryFn: async () => (await supabase.from("projects").select("id, mkj_number, name").eq("status", "active").order("mkj_number")).data ?? [] });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("id, name").order("name")).data ?? [] });

  const [projectId, setProjectId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [billTo, setBillTo] = useState("MKJ Communications\n850 3rd Ave., #407\nBrooklyn, NY 11232");
  const [shipTo, setShipTo] = useState("MKJ Communications\n850 3rd Ave., #407\nBrooklyn, NY 11232");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [shipVia, setShipVia] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([{ line_no: 1, budget_code: "", description: "", qty: 1, unit: "ea", unit_cost: 0 }]);

  const total = lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);

  const create = useMutation({
    mutationFn: async () => {
      const project = projects.data?.find((p) => p.id === projectId);
      if (!project) throw new Error("Choose a project");
      const { data: numRow, error: numErr } = await supabase.rpc("gen_po_number", { _mkj: project.mkj_number });
      if (numErr) throw numErr;
      const { data: user } = await supabase.auth.getUser();
      const { data: poRow, error: insErr } = await supabase.from("purchase_orders").insert({
        po_number: numRow as unknown as string,
        project_id: projectId,
        supplier_id: supplierId || null,
        bill_to: billTo || null,
        ship_to: shipTo || null,
        delivery_date: deliveryDate || null,
        ship_via: shipVia || null,
        payment_terms: paymentTerms || null,
        description: description || null,
        created_by: user.user?.id ?? null,
      }).select("id").single();
      if (insErr) throw insErr;
      const items = lines.filter((l) => l.description.trim()).map((l) => ({
        po_id: poRow.id, line_no: l.line_no, budget_code: l.budget_code || null,
        description: l.description, qty: l.qty, unit: l.unit || "ea", unit_cost: l.unit_cost,
      }));
      if (items.length > 0) {
        const { error: iErr } = await supabase.from("purchase_order_items").insert(items);
        if (iErr) throw iErr;
      }
      return poRow.id as string;
    },
    onSuccess: (id) => {
      toast.success("PO created");
      navigate({ to: "/purchase-orders/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function previewPdf() {
    const project = projects.data?.find((p) => p.id === projectId);
    const supplier = suppliers.data?.find((s) => s.id === supplierId);
    openPOPdf({
      po_number: project ? `${project.mkj_number}-PO (draft preview)` : "PO (draft preview)",
      project_mkj: project?.mkj_number ?? null,
      project_name: project?.name ?? null,
      supplier_name: supplier?.name ?? null,
      bill_to: billTo,
      ship_to: shipTo,
      delivery_date: deliveryDate,
      ship_via: shipVia,
      payment_terms: paymentTerms,
      description: description,
      status: "draft",
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({ ...l, qty: Number(l.qty || 0), unit_cost: Number(l.unit_cost || 0) })),
    });
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { line_no: ls.length + 1, budget_code: "", description: "", qty: 1, unit: "ea", unit_cost: 0 }]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, line_no: idx + 1 })));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New Purchase Order" description="Fill in the details, preview the PDF to double-check everything, then create the PO." />
      <Card><CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.mkj_number} — {p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
              <SelectContent>{suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Bill to</Label><Textarea rows={3} value={billTo} onChange={(e) => setBillTo(e.target.value)} /></div>
          <div><Label>Ship to</Label><Textarea rows={3} value={shipTo} onChange={(e) => setShipTo(e.target.value)} /></div>
          <div><Label>Delivery date</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
          <div><Label>Ship via</Label><Input value={shipVia} onChange={(e) => setShipVia(e.target.value)} /></div>
          <div><Label>Payment terms</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></div>
          <div><Label>Description / notes</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Line items</h3>
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Add line</Button>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8">#</TableHead><TableHead>Budget code</TableHead><TableHead>Description</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead><TableHead className="w-16">Unit</TableHead>
              <TableHead className="w-24 text-right">Unit cost</TableHead><TableHead className="w-24 text-right">Amount</TableHead><TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.line_no}</TableCell>
                  <TableCell><Input value={l.budget_code} onChange={(e) => updateLine(i, { budget_code: e.target.value })} /></TableCell>
                  <TableCell><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" step="0.01" className="text-right" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" step="0.01" className="text-right" value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })} /></TableCell>
                  <TableCell className="text-right font-mono">${(Number(l.qty || 0) * Number(l.unit_cost || 0)).toFixed(2)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={6} className="text-right font-semibold">Grand total</TableCell>
                <TableCell className="text-right font-mono font-semibold">${total.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/purchase-orders" })}>Cancel</Button>
          <Button variant="outline" disabled={!projectId} onClick={previewPdf}><FileText className="mr-1 h-4 w-4" />Preview PDF</Button>
          <Button disabled={!projectId || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create PO"}</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
