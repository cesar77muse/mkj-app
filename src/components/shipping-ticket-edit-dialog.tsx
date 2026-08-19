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
import { SHIPPING_TICKET_STATUSES } from "@/components/shipping-ticket-status-badge";
import { SerialPickerDialog } from "@/components/serial-picker-dialog";
import { fetchTicketItemSerials, saveTicketItemSerials, useSerialSupport, useSerializedProducts } from "@/lib/serials";

type Line = { id?: string; product_id: string; description: string; qty_shipped: number; qty_backordered: number; serials: string[] };

/** Admins can edit any ticket; warehouse managers only while it is not delivered. */
export function canEditTicket(roles: AppRole[], status: string): boolean {
  if (isAdmin(roles)) return true;
  if (!isWarehouseOrAdmin(roles)) return false;
  return status !== "delivered" && status !== "closed";
}

export function ShippingTicketEditDialog({ ticketId, status, variant = "icon" }: { ticketId: string; status: string; variant?: "icon" | "button" }) {
  const rolesQ = useRoles();
  const roles = rolesQ.data ?? [];
  const [open, setOpen] = useState(false);

  if (!canEditTicket(roles, status)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Edit shipping ticket"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {open ? <TicketEditForm ticketId={ticketId} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TicketEditForm({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("id, part_number, description").order("part_number")).data ?? [] });
  const ticket = useQuery({
    queryKey: ["ticket-edit", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase.from("shipping_tickets").select("*").eq("id", ticketId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const itemsQ = useQuery({
    queryKey: ["ticket-edit-items", ticketId],
    queryFn: async () => (await supabase.from("shipping_ticket_items").select("*").eq("ticket_id", ticketId)).data ?? [],
  });

  const [shipDate, setShipDate] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [shipBy, setShipBy] = useState("");
  const [status, setStatus] = useState("ready");
  const [lines, setLines] = useState<Line[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  const serialsOn = useSerialSupport().data === true;
  const serializedProducts = useSerializedProducts(serialsOn);
  const isSerialized = (productId: string) =>
    serialsOn && !!productId && (serializedProducts.data?.has(productId) ?? false);

  const existingSerials = useQuery({
    queryKey: ["ticket-item-serials", ticketId],
    enabled: serialsOn && (itemsQ.data?.length ?? 0) > 0,
    queryFn: () => fetchTicketItemSerials((itemsQ.data ?? []).map((i) => i.id)),
  });

  useEffect(() => {
    if (!ticket.data) return;
    setShipDate(ticket.data.ship_date ?? "");
    setDeliverTo(ticket.data.deliver_to_name ?? "");
    setAddress(ticket.data.deliver_to_address ?? "");
    setContact(ticket.data.contact_name ?? "");
    setPhone(ticket.data.contact_phone ?? "");
    setShipBy(ticket.data.ship_by ?? "");
    setStatus(ticket.data.status ?? "ready");
  }, [ticket.data]);

  useEffect(() => {
    if (!itemsQ.data) return;
    setLines(itemsQ.data.map((l) => ({
      id: l.id,
      product_id: l.product_id ?? "",
      description: l.description ?? "",
      qty_shipped: Number(l.qty_shipped),
      qty_backordered: Number(l.qty_backordered),
      serials: existingSerials.data?.get(l.id) ?? [],
    })));
  }, [itemsQ.data, existingSerials.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (lines.some((l) => !l.description.trim())) throw new Error("Every line needs a description");
      if (status === "draft" || status === "ready") {
        // Draft or ready both mean "not shipped": put any shipped quantities back.
        const { error: revErr } = await supabase.rpc("reverse_shipping_ticket_inventory", { _ticket_id: ticketId } as never);
        if (revErr) throw revErr;
      }
      if (status === "shipped" || status === "delivered") {
        // Deduct inventory for the current line items when the ticket is shipped/delivered.
        const { error: shipErr } = await supabase.rpc("ship_shipping_ticket_inventory", { _ticket_id: ticketId } as never);
        if (shipErr) throw shipErr;
      }
      const { error: upErr } = await supabase.from("shipping_tickets").update({
        ship_date: shipDate,
        deliver_to_name: deliverTo || null,
        deliver_to_address: address || null,
        contact_name: contact || null,
        contact_phone: phone || null,
        ship_by: shipBy || null,
        status: status as never,
      }).eq("id", ticketId);
      if (upErr) throw upErr;

      if (removed.length > 0) {
        const { error } = await supabase.from("shipping_ticket_items").delete().in("id", removed);
        if (error) throw error;
      }
      for (const l of lines) {
        const payload = {
          product_id: l.product_id || null,
          description: l.description,
          qty_shipped: l.qty_shipped,
          qty_backordered: l.qty_backordered,
        };
        let lineId = l.id;
        if (lineId) {
          const { error } = await supabase.from("shipping_ticket_items").update(payload).eq("id", lineId);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from("shipping_ticket_items")
            .insert({ ...payload, ticket_id: ticketId })
            .select("id")
            .single();
          if (error) throw error;
          lineId = created.id;
        }
        if (serialsOn && lineId && isSerialized(l.product_id)) {
          await saveTicketItemSerials(lineId, l.serials);
        }
      }
    },
    onSuccess: () => {
      toast.success("Shipping ticket updated");
      qc.invalidateQueries({ queryKey: ["ticket-item-serials", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-items", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-edit", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-edit-items", ticketId] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => {
      const l = ls[i];
      if (l.id) setRemoved((r) => [...r, l.id!]);
      return ls.filter((_, idx) => idx !== i);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {ticket.data?.ticket_number ?? "shipping ticket"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>Ship date</Label><Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHIPPING_TICKET_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Deliver to (site name)</Label><Input value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} /></div>
        <div><Label>Ship by</Label><Input value={shipBy} onChange={(e) => setShipBy(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Delivery address</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div><Label>On-site contact</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        <div><Label>Contact phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Line items</h3>
          <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { product_id: "", description: "", qty_shipped: 1, qty_backordered: 0, serials: [] }])}><Plus className="mr-1 h-4 w-4" />Add line</Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead>Description</TableHead>
            <TableHead className="w-24 text-right">Shipped</TableHead><TableHead className="w-24 text-right">Backordered</TableHead>{serialsOn ? <TableHead>Serials</TableHead> : null}<TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={l.id ?? `new-${i}`}>
                <TableCell>
                  <Select value={l.product_id} onValueChange={(v) => updateLine(i, { product_id: v, serials: [], description: products.data?.find((p) => p.id === v)?.description ?? l.description })}>
                    <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Select part" /></SelectTrigger>
                    <SelectContent>{products.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.part_number}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></TableCell>
                <TableCell><Input type="number" step={1} min={0} inputMode="numeric" className="text-right" value={l.qty_shipped} onChange={(e) => { const q = Math.max(0, Math.trunc(Number(e.target.value) || 0)); updateLine(i, { qty_shipped: q, serials: l.serials.slice(0, q) }); }} /></TableCell>
                <TableCell><Input type="number" step={1} min={0} inputMode="numeric" className="text-right" value={l.qty_backordered} onChange={(e) => updateLine(i, { qty_backordered: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></TableCell>
                {serialsOn ? (
                  <TableCell>
                    {isSerialized(l.product_id) && ticket.data?.project_id ? (
                      <SerialPickerDialog
                        projectId={ticket.data.project_id}
                        productId={l.product_id}
                        qty={l.qty_shipped}
                        selected={l.serials}
                        onChange={(next) => updateLine(i, { serials: next })}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
                <TableCell><Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
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
