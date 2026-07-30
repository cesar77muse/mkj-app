import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { POStatusBadge } from "@/components/po-status-badge";
import { PackingSlipEditDialog } from "@/components/packing-slip-edit-dialog";

export const Route = createFileRoute("/_authenticated/packing-slips/$id")({
  head: () => ({ meta: [{ title: "Packing Slip — MKJ Ops" }] }),
  component: SlipView,
});

function SlipView() {
  const { id } = Route.useParams();
  const slip = useQuery({
    queryKey: ["ps", id],
    queryFn: async () => (await supabase.from("packing_slips").select("*, projects:project_id(mkj_number, name), purchase_orders:po_id(po_number)").eq("id", id).maybeSingle()).data,
  });
  const items = useQuery({
    queryKey: ["ps-items", id],
    queryFn: async () => (await supabase.from("packing_slip_items").select("*").eq("slip_id", id)).data ?? [],
  });

  if (!slip.data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Packing Slip ${slip.data.slip_number}`}
        description={`Received ${slip.data.received_date}`}
        actions={
          <div className="flex items-center gap-2">
            <POStatusBadge status={slip.data.status} />
            <PackingSlipEditDialog
              slip={slip.data}
              items={(items.data ?? []).map((l) => ({
                id: l.id,
                product_id: l.product_id,
                description: l.description,
                qty_ordered: Number(l.qty_ordered),
                qty_received: Number(l.qty_received),
                condition: l.condition,
              }))}
            />
          </div>
        }
      />
      <Card><CardContent className="p-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div>Project: <Link className="font-mono text-primary hover:underline" to="/projects/$mkj" params={{ mkj: slip.data.projects?.mkj_number ?? "" }}>{slip.data.projects?.mkj_number}</Link></div>
          <div>PO: <Link className="font-mono text-primary hover:underline" to="/purchase-orders/$id" params={{ id: slip.data.po_id }}>{slip.data.purchase_orders?.po_number}</Link></div>
          <div>Carrier: {slip.data.carrier ?? "—"}</div>
          <div>Vendor slip #: {slip.data.vendor_slip_number ?? "—"}</div>
        </div>
        {slip.data.notes ? <div className="mt-3 whitespace-pre-wrap text-muted-foreground">{slip.data.notes}</div> : null}
      </CardContent></Card>


      <Card className="mt-4"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Ordered</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Backorder</TableHead>
            <TableHead>Condition</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(items.data ?? []).map((l) => {
              const bo = Math.max(0, Number(l.qty_ordered) - Number(l.qty_received));
              return (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right">{Number(l.qty_ordered)}</TableCell>
                  <TableCell className="text-right">{Number(l.qty_received)}</TableCell>
                  <TableCell className="text-right">{bo > 0 ? <Badge variant="destructive">{bo}</Badge> : bo}</TableCell>
                  <TableCell>{l.condition}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
