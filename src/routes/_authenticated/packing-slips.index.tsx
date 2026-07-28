import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRoles } from "@/hooks/use-session";
import { canWrite } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/packing-slips/")({
  head: () => ({ meta: [{ title: "Packing Slips — MKJ Ops" }] }),
  component: PSList,
});

function PSList() {
  const roles = useRoles();
  const writable = canWrite(roles.data ?? []);
  const list = useQuery({
    queryKey: ["packing-slips"],
    queryFn: async () => (await supabase
      .from("packing_slips")
      .select("id, slip_number, received_date, vendor_slip_number, projects:project_id(mkj_number), purchase_orders:po_id(po_number)")
      .order("received_date", { ascending: false })
      .limit(200)).data ?? [],
  });
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Packing Slips"
        description="Goods-receipt records against purchase orders."
        actions={writable ? (
          <Button asChild>
            <Link to="/packing-slips/new"><Plus className="mr-1.5 h-4 w-4" />Add Packing Slip</Link>
          </Button>
        ) : undefined}
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Slip #</TableHead><TableHead>Project</TableHead><TableHead>PO</TableHead><TableHead>Vendor slip #</TableHead><TableHead>Received</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.data && list.data.length > 0 ? list.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell><Link className="font-mono text-primary hover:underline" to="/packing-slips/$id" params={{ id: s.id }}>{s.slip_number}</Link></TableCell>
                <TableCell className="font-mono text-xs">{s.projects?.mkj_number}</TableCell>
                <TableCell className="font-mono text-xs">{s.purchase_orders?.po_number}</TableCell>
                <TableCell>{s.vendor_slip_number ?? "—"}</TableCell>
                <TableCell>{s.received_date}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No packing slips yet. Receive a shipment from a PO.
                {writable ? (
                  <div className="mt-3">
                    <Button asChild size="sm"><Link to="/packing-slips/new"><Plus className="mr-1.5 h-4 w-4" />Add Packing Slip</Link></Button>
                  </div>
                ) : null}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
