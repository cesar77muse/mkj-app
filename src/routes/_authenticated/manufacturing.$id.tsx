import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Pencil, Send, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { BuildStatusBadge, LineOriginBadge, LineStockState } from "@/components/build-request-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRoles, useSession } from "@/hooks/use-session";
import { useMyManagedProjectIds } from "@/lib/po-requests";
import {
  OPEN_BUILD_STATUSES,
  buildPermissions,
  computeCoverage,
  useBuildRequest,
  useProjectAvailable,
  type BuildEvent,
} from "@/lib/build-requests";
import { formatQty } from "@/lib/system-templates";

export const Route = createFileRoute("/_authenticated/manufacturing/$id")({
  head: () => ({ meta: [{ title: "Build request — MKJ Ops" }] }),
  component: BuildRequestPage,
});

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  submitted: "Submitted to the shop",
  pulled_back: "Pulled back to draft",
  rejected: "Rejected",
  parts_held: "Parts arrived and were held",
};

function eventDetail(e: BuildEvent): string {
  const p = e.payload ?? {};
  if (e.kind === "submitted") return `${p.covered} of ${p.total} parts fully held`;
  if (e.kind === "parts_held") {
    const still = Number(p.still_pending ?? 0);
    return `${p.qty} × ${p.part_number}${still > 0 ? ` · ${still} still pending` : ""}`;
  }
  if ((e.kind === "created" || e.kind === "edited") && Array.isArray(p.removed) && p.removed.length > 0) {
    return `Left out from the system's list: ${(p.removed as string[]).join(", ")}`;
  }
  return e.note ?? "";
}

function BuildRequestPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { userId } = useSession();
  const roles = useRoles().data ?? [];
  const managed = useMyManagedProjectIds().data ?? [];
  const query = useBuildRequest(id);
  const r = query.data?.request ?? null;
  const events = query.data?.events ?? [];
  const editable = !!r && (r.status === "draft" || r.status === "rejected");
  const available = useProjectAvailable(editable ? r!.project_id : null);
  const [dialog, setDialog] = useState<"reject" | "pull-back" | null>(null);
  const [note, setNote] = useState("");

  function refresh() {
    qc.invalidateQueries({ queryKey: ["build-request", id] });
    qc.invalidateQueries({ queryKey: ["build-requests"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("submit_build_request", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${r!.request_number} submitted — the available parts are now held`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pullBack = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pull_back_build_request", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${r!.request_number} is a draft again. Its held parts were released.`);
      setDialog(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Give a reason for rejecting");
      const { error } = await supabase.rpc("reject_build_request", { _request_id: id, _note: note });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${r!.request_number} rejected. The requester was notified.`);
      setDialog(null);
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!r) return <p className="text-sm text-muted-foreground">Build request not found.</p>;

  const perms = buildPermissions(r, roles, managed);
  const open = OPEN_BUILD_STATUSES.includes(r.status);
  const coverageNow = editable
    ? computeCoverage(
        r.lines.map((l) => ({ product_id: l.product_id, part_number: l.product?.part_number ?? "?", is_key_part: l.is_key_part, required: l.qty_required })),
        available.data ?? new Map(),
      )
    : null;
  const fullyHeld = r.lines.filter((l) => l.qty_held >= l.qty_required).length;
  const who = (uid: string | null, name: string | null) => (uid && uid === userId ? "You" : name ?? "Unknown user");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={r.request_number}
        description={`${r.qty} × ${r.template?.system_code ?? "system"}${r.template?.name ? ` — ${r.template.name}` : ""} · ${r.project_number}${r.project_name ? ` — ${r.project_name}` : ""}`}
        backTo="/manufacturing"
        actions={
          <>
            <BuildStatusBadge status={r.status} className="mr-1" />
            {perms.canEdit ? (
              <Button variant="outline" asChild>
                <Link to="/manufacturing/edit/$id" params={{ id }}><Pencil className="mr-2 h-4 w-4" />Edit</Link>
              </Button>
            ) : null}
            {perms.canPullBack ? (
              <Button variant="outline" onClick={() => setDialog("pull-back")}><Undo2 className="mr-2 h-4 w-4" />Pull back</Button>
            ) : null}
            {perms.canReject ? (
              <Button variant="outline" onClick={() => setDialog("reject")}><XCircle className="mr-2 h-4 w-4" />Reject</Button>
            ) : null}
            {perms.canSubmit ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || available.isLoading || !coverageNow?.passes}>
                <Send className="mr-2 h-4 w-4" />{submit.isPending ? "Submitting…" : "Submit to the shop"}
              </Button>
            ) : null}
          </>
        }
      />

      {r.status === "rejected" && r.reject_note ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Rejected by {who(r.rejected_by, r.rejecter_name)}{r.rejected_at ? ` · ${new Date(r.rejected_at).toLocaleString()}` : ""}</AlertTitle>
          <AlertDescription>{r.reject_note} {perms.canEdit ? "Edit the request and submit it again." : ""}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Requested</div>
            <div>{who(r.requested_by, r.requester_name)}</div>
            <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Parts</div>
            {open ? (
              <>
                <div><strong>{fullyHeld} of {r.lines.length}</strong> fully held</div>
                <div className="text-muted-foreground">
                  {fullyHeld < r.lines.length ? "Parts still pending are held automatically as they arrive in the project." : "Everything this build needs is held."}
                </div>
              </>
            ) : coverageNow ? (
              <>
                <div><strong>{coverageNow.covered} of {coverageNow.total}</strong> can be fully held now ({coverageNow.pct}%)</div>
                <div className={coverageNow.passes ? "text-muted-foreground" : "text-destructive"}>
                  {coverageNow.passes ? "Ready to submit." : coverageNow.reason}
                </div>
              </>
            ) : (
              <div>{r.lines.length} parts</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
            <p className="whitespace-pre-wrap">{r.notes ?? <span className="text-muted-foreground">None</span>}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Parts for {r.qty} × {r.template?.system_code}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Part</TableHead>
                <TableHead className="text-right">Per unit</TableHead>
                <TableHead className="text-right">Needed</TableHead>
                <TableHead className="text-right">{editable ? "Available now" : "Held"}</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.lines.map((l, i) => {
                const row = coverageNow?.rows[i];
                const covered = editable ? !!row?.covered : l.qty_held >= l.qty_required;
                const pending = editable ? (row ? row.required - row.canHold : l.qty_required) : l.qty_required - l.qty_held;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.line_no}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs">{l.product?.part_number}</span>
                        {l.is_key_part ? <Badge>Key</Badge> : null}
                        <LineOriginBadge origin={l.origin} />
                      </div>
                      <div className="text-xs text-muted-foreground">{l.product?.description}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(l.qty_per_unit)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatQty(l.qty_required)} <span className="text-xs text-muted-foreground">{l.product?.unit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editable ? (row ? formatQty(row.available) : "—") : formatQty(l.qty_held)}
                    </TableCell>
                    <TableCell>
                      {editable || open ? <LineStockState covered={covered} pending={formatQty(pending)} /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <div>
                    <span className="font-medium">{EVENT_LABELS[e.kind] ?? e.kind}</span>
                    <span className="text-muted-foreground"> · {who(e.actor, e.actor_name)} · {new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  {eventDetail(e) ? <div className="text-muted-foreground">{eventDetail(e)}</div> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "reject" ? `Reject ${r.request_number}` : `Pull back ${r.request_number}`}</DialogTitle>
            <DialogDescription>
              {dialog === "reject"
                ? "Its held parts are released and the requester is notified. They can edit the request and submit it again."
                : "It goes back to draft and its held parts are released, so other builds or tickets can use them. You can submit it again later if the stock is still there."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "reject" ? (
            <div className="space-y-2">
              <Label htmlFor="reject-note">Reason</Label>
              <Textarea
                id="reject-note"
                rows={3}
                placeholder="e.g. wrong system for this site, or quantity needs confirming"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Back</Button>
            {dialog === "reject" ? (
              <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending || !note.trim()}>
                {reject.isPending ? "Rejecting…" : "Reject request"}
              </Button>
            ) : (
              <Button onClick={() => pullBack.mutate()} disabled={pullBack.isPending}>
                {pullBack.isPending ? "Pulling back…" : "Pull back to draft"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
