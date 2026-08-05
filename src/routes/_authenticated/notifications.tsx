import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — MKJ Ops" }] }),
  component: NotificationsPage,
});

const NOTIF_LIST_LIMIT = 100;

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: async () => {
      // Fetch one past the cap so a full page can be told apart from a
      // truncated one, instead of silently dropping anything past the limit.
      const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(NOTIF_LIST_LIMIT + 1);
      const rows = data ?? [];
      return { rows: rows.slice(0, NOTIF_LIST_LIMIT), truncated: rows.length > NOTIF_LIST_LIMIT };
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Notification links look like "/borrow-requests?request=<id>"; open them as
  // a router navigation with parsed search params and mark the item as read.
  async function open(n: { id: string; link: string | null; read_at: string | null }) {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (!n.link) return;
    const [path, qs] = n.link.split("?");
    const search = Object.fromEntries(new URLSearchParams(qs ?? ""));
    navigate({ to: path, search });
  }


  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        description="Events across your projects."
        actions={<Button variant="outline" size="sm" onClick={() => markAll.mutate()}>Mark all read</Button>}
      />
      {list.data?.truncated ? (
        <p className="mb-3 text-xs text-muted-foreground">Showing the most recent {NOTIF_LIST_LIMIT} notifications.</p>
      ) : null}
      <Card><CardContent className="p-0">
        {list.data && list.data.rows.length > 0 ? (
          <ul className="divide-y">
            {list.data.rows.map((n) => (
              <li key={n.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      {!n.read_at ? <Badge variant="destructive" className="text-[10px]">New</Badge> : null}
                    </div>
                    {n.body ? <div className="mt-1 text-sm text-muted-foreground">{n.body}</div> : null}
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  {n.link ? <Button variant="outline" size="sm" onClick={() => open(n)}>Open</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
        )}
      </CardContent></Card>
    </div>
  );
}
