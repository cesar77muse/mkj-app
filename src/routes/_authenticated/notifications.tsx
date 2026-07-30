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

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
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
      <Card><CardContent className="p-0">
        {list.data && list.data.length > 0 ? (
          <ul className="divide-y">
            {list.data.map((n) => (
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
                  {n.link ? <Link to={n.link} className="text-sm text-primary hover:underline">Open</Link> : null}
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
