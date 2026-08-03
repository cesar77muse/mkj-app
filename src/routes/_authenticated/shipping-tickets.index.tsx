import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { openShippingTicketPdf } from "@/lib/shipping-ticket-pdf";
import { ShippingTicketEditDialog } from "@/components/shipping-ticket-edit-dialog";
import { ShippingTicketDeleteButton } from "@/components/shipping-ticket-delete-button";
import { UploadSignedTicketButton } from "@/components/upload-signed-ticket-button";
import { ShippingTicketStatusBadge } from "@/components/shipping-ticket-status-badge";


export const Route = createFileRoute("/_authenticated/shipping-tickets/")({
  head: () => ({ meta: [{ title: "Shipping Tickets — MKJ Ops" }] }),
  component: STList,
});

function STList() {
  const list = useQuery({
    queryKey: ["tickets"],

    queryFn: async () => (await supabase
      .from("shipping_tickets")
      .select("id, ticket_number, ship_date, created_at, status, deliver_to_name, projects:project_id(mkj_number)")
      .order("ship_date", { ascending: false })
      .limit(200)).data ?? [],
  });

  const pdfMut = useMutation({
    mutationFn: (ticketId: string) => openShippingTicketPdf(ticketId),
    onError: (e: Error) => toast.error(e.message),
  });

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = list.data ?? [];
    if (!needle) return rows;
    return rows.filter((t) =>
      [t.ticket_number, t.projects?.mkj_number, t.deliver_to_name, t.status]
        .some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [list.data, q]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Shipping Tickets"
        description="Deliveries going out to job sites."
        actions={<Link to="/shipping-tickets/new"><Button><Plus className="mr-1 h-4 w-4" />New Ticket</Button></Link>}
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticket #, project or deliver to…"
          className="pl-9"
        />
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket #</TableHead><TableHead>Project</TableHead><TableHead>Deliver to</TableHead><TableHead>Delivery date</TableHead><TableHead>Created date</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((t) => (

              <TableRow key={t.id}>
                <TableCell><Link className="font-mono text-primary hover:underline" to="/shipping-tickets/$id" params={{ id: t.id }}>{t.ticket_number}</Link></TableCell>
                <TableCell className="font-mono text-xs">{t.projects?.mkj_number}</TableCell>
                <TableCell>{t.deliver_to_name ?? "—"}</TableCell>
                <TableCell>{t.ship_date}</TableCell>
                <TableCell className="text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</TableCell>
                <TableCell><ShippingTicketStatusBadge status={t.status} /></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pdfMut.mutate(t.id)}
                      disabled={pdfMut.isPending && pdfMut.variables === t.id}
                    >
                      <FileText className="mr-1 h-4 w-4" />
                      {pdfMut.isPending && pdfMut.variables === t.id ? "Opening…" : "View Ticket"}
                    </Button>
                    <UploadSignedTicketButton status={t.status} ticketNumber={t.ticket_number} />
                    <ShippingTicketEditDialog ticketId={t.id} status={t.status} />
                    <ShippingTicketDeleteButton ticketId={t.id} ticketNumber={t.ticket_number} status={t.status} />

                  </div>
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No tickets yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
