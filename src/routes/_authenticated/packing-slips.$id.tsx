import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, Upload } from "lucide-react";
import { POStatusBadge } from "@/components/po-status-badge";
import { PackingSlipEditDialog } from "@/components/packing-slip-edit-dialog";
import { PackingSlipDeleteButton } from "@/components/packing-slip-delete-button";
import { getPackingSlipAttachmentUrl, uploadPackingSlipAttachment } from "@/lib/packing-slip-attachments";

export const Route = createFileRoute("/_authenticated/packing-slips/$id")({
  head: () => ({ meta: [{ title: "Packing Slip — MKJ Ops" }] }),
  component: SlipView,
});

function SlipView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const slip = useQuery({
    queryKey: ["ps", id],
    queryFn: async () => (await supabase.from("packing_slips").select("*, projects:project_id(mkj_number, name), purchase_orders:po_id(po_number)").eq("id", id).maybeSingle()).data,
  });
  const items = useQuery({
    queryKey: ["ps-items", id],
    queryFn: async () => (await supabase.from("packing_slip_items").select("*, products:product_id(part_number)").eq("slip_id", id)).data ?? [],
  });

  const viewAttachmentMut = useMutation({
    mutationFn: async (path: string) => getPackingSlipAttachmentUrl(path),
    onSuccess: (url) => window.open(url, "_blank"),
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadAttachmentMut = useMutation({
    mutationFn: (file: File) => uploadPackingSlipAttachment(id, file),
    onSuccess: () => {
      toast.success("Attachment uploaded");
      qc.invalidateQueries({ queryKey: ["ps", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (slip.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!slip.data) return <p className="text-sm text-muted-foreground">Not found.</p>;

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
                part_number: l.products?.part_number ?? null,
                description: l.description,
                qty_ordered: Number(l.qty_ordered),
                qty_received: Number(l.qty_received),
                condition: l.condition,
              }))}
            />
            <PackingSlipDeleteButton
              slipId={id}
              slipNumber={slip.data.slip_number}
              poId={slip.data.po_id}
              variant="button"
              onDeleted={() => navigate({ to: "/packing-slips" })}
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
        <div className="mt-3 flex items-center gap-2">
          {slip.data.attachment_url ? (
            <Button
              size="sm"
              variant="outline"
              disabled={viewAttachmentMut.isPending}
              onClick={() => viewAttachmentMut.mutate(slip.data!.attachment_url!)}
            >
              <Paperclip className="mr-1.5 h-4 w-4" />{viewAttachmentMut.isPending ? "Opening…" : "View vendor slip scan"}
            </Button>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline">
              <Upload className="h-4 w-4" />
              {uploadAttachmentMut.isPending ? "Uploading…" : "Attach vendor slip scan"}
              <Input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={uploadAttachmentMut.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAttachmentMut.mutate(file);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
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
