import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { openShippingTicketPdf } from "@/lib/shipping-ticket-pdf";
import { ShippingTicketEditDialog } from "@/components/shipping-ticket-edit-dialog";

export const Route = createFileRoute("/_authenticated/shipping-tickets/$id")({
  head: () => ({ meta: [{ title: "Shipping Ticket — MKJ Ops" }] }),
  component: TicketView,
});

function TicketView() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await supabase.from("shipping_tickets").select("*, projects:project_id(mkj_number, name)").eq("id", id).maybeSingle()).data,
  });
  const items = useQuery({
    queryKey: ["ticket-items", id],
    queryFn: async () => (await supabase.from("shipping_ticket_items").select("*").eq("ticket_id", id)).data ?? [],
  });

  const shipMut = useMutation({
    mutationFn: async () => {
      if (!ticket.data || !items.data) return;
      const { data: user } = await supabase.auth.getUser();
      const adjRows = items.data.filter((l) => l.product_id && Number(l.qty_shipped) > 0).map((l) => ({
        project_id: ticket.data!.project_id,
        product_id: l.product_id!,
        delta: -Number(l.qty_shipped),
        source_type: "shipping_ticket" as const,
        source_id: ticket.data!.id,
        reason: `Shipped on ticket ${ticket.data!.ticket_number}`,
        created_by: user.user?.id ?? null,
      }));
      if (adjRows.length > 0) {
        const { error: aErr } = await supabase.from("inventory_adjustments").insert(adjRows);
        if (aErr) throw aErr;
      }
      const { error } = await supabase.from("shipping_tickets").update({ status: "shipped" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked shipped; inventory decremented");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deliveredMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shipping_tickets").update({ status: "delivered", received_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked delivered");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  const pdfMut = useMutation({
    mutationFn: () => openShippingTicketPdf(id),
    onError: (e: Error) => toast.error(e.message),
  });



  if (!ticket.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const t = ticket.data;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Shipping Ticket ${t.ticket_number}`}
        description={`Project ${t.projects?.mkj_number} — ${t.projects?.name}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t.status}</Badge>
            <ShippingTicketEditDialog ticketId={t.id} status={t.status} variant="button" />
            {t.status === "draft" || t.status === "ready" ? (
              <Button size="sm" onClick={() => shipMut.mutate()}>Mark shipped</Button>
            ) : null}
            {t.status === "shipped" ? (
              <Button size="sm" variant="outline" onClick={() => deliveredMut.mutate()}>Mark delivered</Button>
            ) : null}
          </div>
        }
      />
      <Card><CardContent className="p-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div>Deliver to: <span className="font-medium">{t.deliver_to_name ?? "—"}</span></div>
          <div>Ship by: {t.ship_by ?? "—"}</div>
          <div className="md:col-span-2 whitespace-pre-wrap text-muted-foreground">{t.deliver_to_address}</div>
          <div>Contact: {t.contact_name ?? "—"} {t.contact_phone ? `(${t.contact_phone})` : ""}</div>
          
          <div>Contract: {t.contract_number ?? "—"}</div>
          <div>Ship date: {t.ship_date}</div>
        </div>
      </CardContent></Card>

      <Card className="mt-4"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Part / description</TableHead>
            <TableHead className="text-right">Shipped</TableHead>
            <TableHead className="text-right">Backordered</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(items.data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.description}</TableCell>
                <TableCell className="text-right">{Number(l.qty_shipped)}</TableCell>
                <TableCell className="text-right">{Number(l.qty_backordered) > 0 ? <Badge variant="destructive">{Number(l.qty_backordered)}</Badge> : 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <div className="mt-3 text-xs text-muted-foreground">
        Return to <Link className="text-primary hover:underline" to="/projects/$mkj" params={{ mkj: t.projects?.mkj_number ?? "" }}>{t.projects?.mkj_number}</Link>
      </div>
    </div>
  );
}
