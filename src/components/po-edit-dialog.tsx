import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Plus, Trash } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { isAdmin, isWarehouseOrAdmin, type AppRole } from "@/lib/roles";
import { AssigneeSelect } from "@/components/assignee-select";

type Line = { id?: string; line_no: number; budget_code: string; description: string; qty: number; unit: string; unit_cost: number };

/** Admins can edit any PO; warehouse managers only while the PO is not fully received. */
export function canEditPO(roles: AppRole[], status: string): boolean {
  if (isAdmin(roles)) return true;
  if (!isWarehouseOrAdmin(roles)) return false;
  return status !== "received";
}

export function POEditDialog({ poId, status, variant = "icon" }: { poId: string; status: string; variant?: "icon" | "button" }) {
  const rolesQ = useRoles();
  const roles = rolesQ.data ?? [];
  const [open, setOpen] = useState(false);

  if (!canEditPO(roles, status)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Edit purchase order"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {open ? <POEditForm poId={poId} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function POEditForm({ poId, onDone }: { poId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("id, name").order("name")).data ?? [] });
  const po = useQuery({
    queryKey: ["po-edit", poId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders").select("*").eq("id", poId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const itemsQ = useQuery({
    queryKey: ["po-edit-items", poId],
    queryFn: async () => (await supabase.from("purchase_order_items").select("*").eq("po_id", poId).order("line_no")).data ?? [],
  });

  const [supplierId, setSupplierId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [shipVia, setShipVia] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [billTo, setBillTo] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [description, setDescription] = useState("");
  const [additionalFreight, setAdditionalFreight] = useState(0);
  const [termsConditions, setTermsConditions] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  useEffect(() => {
    if (!po.data) return;
    setSupplierId(po.data.supplier_id ?? "");
    setAssigneeId(po.data.assignee ?? null);
    setDeliveryDate(po.data.delivery_date ?? "");
    setShipVia(po.data.ship_via ?? "");
    setPaymentTerms(po.data.payment_terms ?? "");
    setBillTo(po.data.bill_to ?? "");
    setShipTo(po.data.ship_to ?? "");
    setDescription(po.data.description ?? "");
    setAdditionalFreight(Number(po.data.additional_freight ?? 0));
    setTermsConditions(po.data.terms_conditions ?? "");
  }, [po.data]);

  useEffect(() => {
    if (!itemsQ.data) return;
    setLines(itemsQ.data.map((l) => ({
      id: l.id, line_no: l.line_no, budget_code: l.budget_code ?? "", description: l.description,
      qty: Number(l.qty), unit: l.unit ?? "ea", unit_cost: Number(l.unit_cost),
    })));
  }, [itemsQ.data]);

  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0) + Number(additionalFreight || 0);

  const save = useMutation({
    mutationFn: async () => {
      if (lines.some((l) => !l.description.trim())) throw new Error("Every line needs a description");
      const { error: upErr } = await supabase.from("purchase_orders").update({
        supplier_id: supplierId || null,
        assignee: assigneeId,
        delivery_date: deliveryDate || null,
        ship_via: shipVia || null,
        payment_terms: paymentTerms || null,
        bill_to: billTo || null,
        ship_to: shipTo || null,
        description: description || null,
        additional_freight: additionalFreight || 0,
        terms_conditions: termsConditions || null,
      }).eq("id", poId);
      if (upErr) throw upErr;

      if (removed.length > 0) {
        const { error } = await supabase.from("purchase_order_items").delete().in("id", removed);
        if (error) throw error;
      }
      for (const l of lines) {
        const payload = {
          line_no: l.line_no, budget_code: l.budget_code || null, description: l.description,
          qty: l.qty, unit: l.unit || "ea", unit_cost: l.unit_cost,
        };
        if (l.id) {
          const { error } = await supabase.from("purchase_order_items").update(payload).eq("id", l.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("purchase_order_items").insert({ ...payload, po_id: poId });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Purchase order updated");
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["po", poId] });
      qc.invalidateQueries({ queryKey: ["po-items", poId] });
      qc.invalidateQueries({ queryKey: ["po-edit", poId] });
      qc.invalidateQueries({ queryKey: ["po-edit-items", poId] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { line_no: ls.length + 1, budget_code: "", description: "", qty: 1, unit: "ea", unit_cost: 0 }]);
  }
  function removeLine(i: number) {
    setLines((ls) => {
      const l = ls[i];
      if (l.id) setRemoved((r) => [...r, l.id!]);
      return ls.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, line_no: idx + 1 }));
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {po.data?.po_number ?? "purchase order"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
            <SelectContent>{suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="po-edit-assignee">Assignee</Label>
          <AssigneeSelect id="po-edit-assignee" value={assigneeId} onChange={setAssigneeId} />
        </div>
        <div><Label>Delivery date</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
        <div><Label>Ship via</Label><Input value={shipVia} onChange={(e) => setShipVia(e.target.value)} /></div>
        <div><Label>Payment terms</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></div>
        <div><Label>Additional freight</Label><Input type="number" step="0.01" min={0} value={additionalFreight} onChange={(e) => setAdditionalFreight(Math.max(0, Number(e.target.value) || 0))} /></div>
        <div><Label>Bill to</Label><Textarea rows={3} value={billTo} onChange={(e) => setBillTo(e.target.value)} /></div>
        <div><Label>Ship to</Label><Textarea rows={3} value={shipTo} onChange={(e) => setShipTo(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Description / notes</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Terms & conditions</Label><Textarea rows={2} value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} /></div>
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
              <TableRow key={l.id ?? `new-${i}`}>
                <TableCell>{l.line_no}</TableCell>
                <TableCell><Input value={l.budget_code} onChange={(e) => updateLine(i, { budget_code: e.target.value })} /></TableCell>
                <TableCell><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></TableCell>
                <TableCell><Input type="number" step={1} min={0} inputMode="numeric" className="text-right" value={l.qty} onChange={(e) => updateLine(i, { qty: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></TableCell>
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

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save changes"}</Button>
      </DialogFooter>
    </>
  );
}
