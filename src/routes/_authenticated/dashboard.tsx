import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useRoles } from "@/hooks/use-session";
import { ROLE_LABELS, highestRole } from "@/lib/roles";
import { daysAgoInBusinessTimezone } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, ClipboardList, Truck, Package, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MKJ Ops" }] }),
  component: Dashboard,
});

function StatCard({ label, value, to, icon: Icon }: { label: string; value: number | string; to: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link to={to} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Dashboard() {
  const { data: roles = [] } = useRoles();
  const top = highestRole(roles);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [projects, pos, tickets, slips, borrow] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("purchase_orders").select("*", { count: "exact", head: true }).in("status", ["draft", "approved", "executed", "partially_received"]),
        supabase.from("shipping_tickets").select("*", { count: "exact", head: true }).in("status", ["draft", "ready"]),
        supabase.from("packing_slips").select("*", { count: "exact", head: true }).gte("received_date", daysAgoInBusinessTimezone(7)),
        supabase.from("borrow_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return {
        activeProjects: projects.count ?? 0,
        openPOs: pos.count ?? 0,
        openTickets: tickets.count ?? 0,
        slipsWeek: slips.count ?? 0,
        pendingBorrow: borrow.count ?? 0,
      };
    },
  });

  const recent = useQuery({
    queryKey: ["dashboard-recent-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, mkj_number, name, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Snapshot across every project you have access to."
        actions={top ? <Badge variant="secondary">{ROLE_LABELS[top]}</Badge> : null}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active Projects" value={stats.data?.activeProjects ?? "—"} to="/projects" icon={FolderKanban} />
        <StatCard label="Open POs" value={stats.data?.openPOs ?? "—"} to="/purchase-orders" icon={ClipboardList} />
        <StatCard label="Packing Slips (7d)" value={stats.data?.slipsWeek ?? "—"} to="/packing-slips" icon={Package} />
        <StatCard label="Tickets to Ship" value={stats.data?.openTickets ?? "—"} to="/shipping-tickets" icon={Truck} />
        <StatCard label="Pending Borrows" value={stats.data?.pendingBorrow ?? "—"} to="/borrow-requests" icon={ArrowLeftRight} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent projects</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.data && recent.data.length > 0 ? (
            <ul className="divide-y">
              {recent.data.map((p) => (
                <li key={p.id} className="py-2">
                  <Link to="/projects/$mkj" params={{ mkj: p.mkj_number }} className="flex items-center justify-between gap-2 hover:underline">
                    <div>
                      <div className="font-mono text-sm text-primary">{p.mkj_number}</div>
                      <div className="text-sm text-muted-foreground">{p.name}</div>
                    </div>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No projects yet. Create one from the Projects page.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
