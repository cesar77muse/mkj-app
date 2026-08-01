import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { POEditDialog } from "@/components/po-edit-dialog";
import { PODeleteButton } from "@/components/po-delete-button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import { openPurchaseOrderPdf } from "@/lib/po-pdf";

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

  const poIds = (pos.data ?? []).map((p) => p.id);
  const receipts = useQuery({
    enabled: poIds.length > 0,
    queryKey: ["po-last-receipt", poIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("packing_slips")
        .select("po_id, received_date")
        .in("po_id", poIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s) => {
        if (!s.po_id || !s.received_date) return;
        if (!map[s.po_id] || s.received_date > map[s.po_id]) map[s.po_id] = s.received_date;
      });
      return map;
    },
  });

  const pdfMut = useMutation({
    mutationFn: (poId: string) => openPurchaseOrderPdf(poId),
    onError: (e: Error) => toast.error(e.message),
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
            <TableHead>PO #</TableHead><TableHead>Project</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead>Expected</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {pos.data && pos.data.length > 0 ? pos.data.map((po) => (
              <TableRow key={po.id}>
                <TableCell><Link className="font-mono text-primary hover:underline" to="/purchase-orders/$id" params={{ id: po.id }}>{po.po_number}</Link></TableCell>
                <TableCell><span className="font-mono text-xs">{po.projects?.mkj_number}</span></TableCell>
                <TableCell>{po.suppliers?.name ?? "—"}</TableCell>
                <TableCell><POStatusBadge status={po.status} /></TableCell>
                <TableCell>{po.delivery_date ?? "—"}</TableCell>
                <TableCell>{receipts.data?.[po.id] ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pdfMut.mutate(po.id)}
                      disabled={pdfMut.isPending && pdfMut.variables === po.id}
                    >
                      <FileText className="mr-1 h-4 w-4" />
                      {pdfMut.isPending && pdfMut.variables === po.id ? "Opening…" : "View PO"}
                    </Button>
                    <POEditDialog poId={po.id} status={po.status} />
                    <PODeleteButton poId={po.id} poNumber={po.po_number} status={po.status} />
                  </div>
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No purchase orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
