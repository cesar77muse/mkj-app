import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { ShippingTicketEditDialog } from "@/components/shipping-ticket-edit-dialog";

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
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Shipping Tickets"
        description="Deliveries going out to job sites."
        actions={<Link to="/shipping-tickets/new"><Button><Plus className="mr-1 h-4 w-4" />New Ticket</Button></Link>}
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket #</TableHead><TableHead>Project</TableHead><TableHead>Deliver to</TableHead><TableHead>Delivery date</TableHead><TableHead>Created date</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {list.data && list.data.length > 0 ? list.data.map((t) => (
              <TableRow key={t.id}>
                <TableCell><Link className="font-mono text-primary hover:underline" to="/shipping-tickets/$id" params={{ id: t.id }}>{t.ticket_number}</Link></TableCell>
                <TableCell className="font-mono text-xs">{t.projects?.mkj_number}</TableCell>
                <TableCell>{t.deliver_to_name ?? "—"}</TableCell>
                <TableCell>{t.ship_date}</TableCell>
                <TableCell><Badge variant="secondary">{t.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="outline"><FileText className="mr-1 h-4 w-4" />View Ticket</Button>
                    <ShippingTicketEditDialog ticketId={t.id} status={t.status} />
                  </div>
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No tickets yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
