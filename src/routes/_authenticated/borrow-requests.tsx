import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/borrow-requests")({
  head: () => ({ meta: [{ title: "Borrow Requests — MKJ Ops" }] }),
  component: BorrowPage,
});

function BorrowPage() {
  const { userId } = useSession();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["borrow-requests"],
    queryFn: async () => (await supabase
      .from("borrow_requests")
      .select("*, source:source_project_id(mkj_number, name), target:target_project_id(mkj_number, name), product:product_id(part_number, description)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const projects = useQuery({ queryKey: ["projects"], queryFn: async () => (await supabase.from("projects").select("id, mkj_number, name").order("mkj_number")).data ?? [] });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("id, part_number, description").order("part_number")).data ?? [] });

  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [neededBy, setNeededBy] = useState("");

  const onHand = useQuery({
    queryKey: ["onhand", sourceId, productId],
    enabled: !!sourceId && !!productId,
    queryFn: async () => {
      const { data } = await supabase.from("v_project_inventory").select("on_hand").eq("project_id", sourceId).eq("product_id", productId).maybeSingle();
      return Number(data?.on_hand ?? 0);
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (sourceId === targetId) throw new Error("Source and target projects must differ");
      const { error } = await supabase.from("borrow_requests").insert({
        source_project_id: sourceId, target_project_id: targetId, product_id: productId,
        qty_requested: qty, reason: reason || null, needed_by: neededBy || null, requested_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Borrow request submitted");
      setOpen(false);
      setSourceId(""); setTargetId(""); setProductId(""); setQty(1); setReason(""); setNeededBy("");
      qc.invalidateQueries({ queryKey: ["borrow-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, qty_approved, note }: { id: string; status: "approved" | "denied" | "partially_approved"; qty_approved?: number; note?: string }) => {
      const { error: uErr } = await supabase.from("borrow_requests").update({
        status, qty_approved: qty_approved ?? null, decision_note: note ?? null, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", id);
      if (uErr) throw uErr;
      // If (partially) approved, perform the transfer immediately.
      if (status !== "denied") {
        const req = list.data?.find((r) => r.id === id);
        if (!req) return;
        const q = qty_approved ?? Number(req.qty_requested);
        const { data: user } = await supabase.auth.getUser();
        const rows = [
          { project_id: req.source_project_id, product_id: req.product_id, delta: -q, source_type: "borrow_out" as const, source_id: id, reason: `Borrow to ${req.target?.mkj_number}`, created_by: user.user?.id ?? null },
          { project_id: req.target_project_id, product_id: req.product_id, delta: q, source_type: "borrow_in" as const, source_id: id, reason: `Borrow from ${req.source?.mkj_number}`, created_by: user.user?.id ?? null },
        ];
        const { error: aErr } = await supabase.from("inventory_adjustments").insert(rows);
        if (aErr) throw aErr;
        await supabase.from("borrow_requests").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", id);
      }
    },
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["borrow-requests"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Borrow Requests"
        description="Move stock between projects. Requires approval from the source project's manager."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />New Request</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request to borrow</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Borrow from (source project)</Label>
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger><SelectValue placeholder="Source project" /></SelectTrigger>
                    <SelectContent>{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.mkj_number} — {p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>For (target project)</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger><SelectValue placeholder="Target project" /></SelectTrigger>
                    <SelectContent>{projects.data?.filter((p) => p.id !== sourceId).map((p) => <SelectItem key={p.id} value={p.id}>{p.mkj_number} — {p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                    <SelectContent>{products.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.part_number} — {p.description}</SelectItem>)}</SelectContent>
                  </Select>
                  {sourceId && productId ? (
                    <p className="mt-1 text-xs text-muted-foreground">Source on-hand: <span className="font-mono font-semibold">{onHand.data ?? 0}</span></p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Qty</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
                  <div><Label>Needed by</Label><Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></div>
                </div>
                <div><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={!sourceId || !targetId || !productId || create.isPending}>{create.isPending ? "Submitting…" : "Submit"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Product</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
            <TableHead className="text-right">Qty</TableHead><TableHead>Needed by</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {list.data && list.data.length > 0 ? list.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell><div className="font-mono">{r.product?.part_number}</div><div className="text-xs text-muted-foreground">{r.product?.description}</div></TableCell>
                <TableCell className="font-mono text-xs">{r.source?.mkj_number}</TableCell>
                <TableCell className="font-mono text-xs">{r.target?.mkj_number}</TableCell>
                <TableCell className="text-right">{Number(r.qty_requested)}{r.qty_approved != null ? ` (approved ${Number(r.qty_approved)})` : ""}</TableCell>
                <TableCell>{r.needed_by ?? "—"}</TableCell>
                <TableCell><Badge variant={r.status === "fulfilled" ? "default" : r.status === "denied" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="space-x-1 text-right">
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => decide.mutate({ id: r.id, status: "approved", qty_approved: Number(r.qty_requested) })}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, status: "denied" })}>Deny</Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No borrow requests yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
