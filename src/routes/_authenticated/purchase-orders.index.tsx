import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import { openPOPdfById } from "@/lib/po-pdf-open";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — MKJ Ops" }] }),
  component: POList,
});

function POList() {
  const pos = useQuery({
    queryKey: ["pos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, po_number, status, delivery_date, created_at, projects:project_id(mkj_number, name), suppliers:supplier_id(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        description="All POs across projects you can see."
        actions={<Link to="/purchase-orders/new"><Button><Plus className="mr-1 h-4 w-4" />New PO</Button></Link>}
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>PO #</TableHead><TableHead>Project</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead>Delivery</TableHead><TableHead className="w-28 text-right">PDF</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {pos.data && pos.data.length > 0 ? pos.data.map((po) => (
              <TableRow key={po.id}>
                <TableCell><Link className="font-mono text-primary hover:underline" to="/purchase-orders/$id" params={{ id: po.id }}>{po.po_number}</Link></TableCell>
                <TableCell><span className="font-mono text-xs">{po.projects?.mkj_number}</span></TableCell>
                <TableCell>{po.suppliers?.name ?? "—"}</TableCell>
                <TableCell><POStatusBadge status={po.status} /></TableCell>
                <TableCell>{po.delivery_date ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => { const w = window.open("", "_blank"); openPOPdfById(po.id, w).catch((e: Error) => toast.error(e.message)); }}>
                    <FileText className="mr-1 h-4 w-4" />View PO
                  </Button>
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No purchase orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
