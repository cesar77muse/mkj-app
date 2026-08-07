import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { POEditDialog } from "@/components/po-edit-dialog";
import { PODeleteButton } from "@/components/po-delete-button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Plus, Search } from "lucide-react";
import { openPurchaseOrderPdf } from "@/lib/po-pdf";
import { needsProcoreEntry } from "@/components/po-procore-checkbox";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — MKJ Ops" }] }),
  component: POList,
});

const PO_LIST_LIMIT = 200;

function POList() {
  const pos = useQuery({
    queryKey: ["pos"],
    queryFn: async () => {
      // Fetch one past the cap so a full page can be told apart from a
      // truncated one, instead of silently dropping anything past the limit.
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, po_number, status, delivery_date, entered_in_procore, created_at, projects:project_id(mkj_number, name), suppliers:supplier_id(name)")
        .order("created_at", { ascending: false })
        .limit(PO_LIST_LIMIT + 1);
      const rows = data ?? [];
      return { rows: rows.slice(0, PO_LIST_LIMIT), truncated: rows.length > PO_LIST_LIMIT };
    },
  });

  // Sorted so the query key is stable regardless of the order pos.data
  // happens to come back in — an unsorted array of the same IDs in a
  // different order hashes to a different key, triggering a pointless refetch.
  const poIds = useMemo(() => (pos.data?.rows ?? []).map((p) => p.id).sort(), [pos.data]);
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

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = pos.data?.rows ?? [];
    if (!needle) return rows;
    return rows.filter((po) =>
      [po.po_number, po.projects?.mkj_number, po.projects?.name, po.suppliers?.name, po.status]
        .some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [pos.data, q]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        description="All POs across projects you can see."
        actions={<Link to="/purchase-orders/new"><Button><Plus className="mr-1 h-4 w-4" />New PO</Button></Link>}
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PO #, project or supplier…"
          className="pl-9"
        />
      </div>

      {pos.data?.truncated ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Showing the most recent {PO_LIST_LIMIT} purchase orders — search above to narrow results.
        </p>
      ) : null}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>PO #</TableHead><TableHead>Project</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead>Expected</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((po) => (
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
