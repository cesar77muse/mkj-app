import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { openShippingTicketPdf } from "@/lib/shipping-ticket-pdf";
import { ShippingTicketEditDialog } from "@/components/shipping-ticket-edit-dialog";
import { ShippingTicketDeleteButton } from "@/components/shipping-ticket-delete-button";
import { UploadSignedTicketButton } from "@/components/upload-signed-ticket-button";
import { ShippingTicketStatusBadge } from "@/components/shipping-ticket-status-badge";
import { todayInBusinessTimezone } from "@/lib/date";
import { useProfile, useSession } from "@/hooks/use-session";




export const Route = createFileRoute("/_authenticated/shipping-tickets/$id")({
  head: () => ({ meta: [{ title: "Shipping Ticket — MKJ Ops" }] }),
  component: TicketView,
});

function TicketView() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await supabase.from("shipping_tickets").select("*, projects:project_id(mkj_number, name, contract_number)").eq("id", id).maybeSingle()).data,

  });
  const items = useQuery({
    queryKey: ["ticket-items", id],
    queryFn: async () => (await supabase.from("shipping_ticket_items").select("*").eq("ticket_id", id)).data ?? [],
  });

  const shipMut = useMutation({
    mutationFn: async () => {
      if (!ticket.data || !items.data) return;
      const { error: rpcErr } = await supabase.rpc("ship_shipping_ticket_inventory", { _ticket_id: id });
      if (rpcErr) throw rpcErr;
      const { error } = await supabase.from("shipping_tickets").update({ status: "shipped" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked shipped; inventory decremented");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profile = useProfile();
  const { email } = useSession();
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliveredBy, setDeliveredBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [passNumber, setPassNumber] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  function openDeliverDialog() {
    setDeliveredBy(profile.data?.full_name ?? email ?? "");
    setReceivedBy("");
    setPassNumber("");
    setProofFile(null);
    setDeliverOpen(true);
  }

  const deliveredMut = useMutation({
    mutationFn: async () => {
      if (!proofFile) throw new Error("A photo or scan of the signed ticket is required");
      const ext = proofFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${id}/proof.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("shipping-ticket-proofs")
        .upload(path, proofFile, { upsert: true, contentType: proofFile.type || undefined });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("shipping_tickets")
        .update({
          status: "delivered",
          received_date: todayInBusinessTimezone(),
          delivered_by: deliveredBy.trim(),
          received_by: receivedBy.trim(),
          pass_number: passNumber.trim() || null,
          signature_url: path,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked delivered");
      setDeliverOpen(false);
      setProofFile(null);
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const pdfMut = useMutation({
    mutationFn: () => openShippingTicketPdf(id),
    onError: (e: Error) => toast.error(e.message),
  });



  if (ticket.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!ticket.data) return <p className="text-sm text-muted-foreground">Not found.</p>;
  const t = ticket.data;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Shipping Ticket ${t.ticket_number}`}
        description={`Project ${t.projects?.mkj_number} — ${t.projects?.name}`}
        actions={
          <div className="flex items-center gap-2">
            <ShippingTicketStatusBadge status={t.status} />
            <Button size="sm" variant="outline" onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending}>
              <FileText className="mr-1 h-4 w-4" />{pdfMut.isPending ? "Opening…" : "View Ticket"}
            </Button>
            <ShippingTicketEditDialog ticketId={t.id} status={t.status} variant="button" />
            {t.status === "draft" || t.status === "ready" ? (
              <Button size="sm" disabled={shipMut.isPending} onClick={() => shipMut.mutate()}>{shipMut.isPending ? "Marking shipped…" : "Mark shipped"}</Button>
            ) : null}
            {t.status === "shipped" ? (
              <Button size="sm" variant="outline" onClick={openDeliverDialog}>Mark delivered</Button>
            ) : null}

            <UploadSignedTicketButton status={t.status} ticketNumber={t.ticket_number} variant="button" />
            <ShippingTicketDeleteButton
              ticketId={id}
              ticketNumber={t.ticket_number}
              status={t.status}
              variant="button"
              onDeleted={() => navigate({ to: "/shipping-tickets" })}
            />
          </div>

        }
      />
      <Card><CardContent className="p-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div>Deliver to: <span className="font-medium">{t.deliver_to_name ?? "—"}</span></div>
          <div>Ship by: {t.ship_by ?? "—"}</div>
          <div className="md:col-span-2 whitespace-pre-wrap text-muted-foreground">{t.deliver_to_address}</div>
          <div>Contact: {t.contact_name ?? "—"} {t.contact_phone ? `(${t.contact_phone})` : ""}</div>
          
          <div>Contract: {t.projects?.contract_number ?? "—"}</div>
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
