import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — MKJ Ops" }] }),
  component: InventoryPage,
});

type InvRow = {
  project_id: string;
  product_id: string;
  on_hand: number;
  projects: { mkj_number: string; name: string } | null;
  products: { part_number: string; description: string; reorder_point: number } | null;
};

function InventoryPage() {
  const [q, setQ] = useState("");

  const inv = useQuery({
    queryKey: ["inventory", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_inventory")
        .select("project_id, product_id, on_hand, projects:project_id(mkj_number, name), products:product_id(part_number, description, reorder_point)");
      if (error) throw error;
      return (data ?? []) as unknown as InvRow[];
    },
  });

  const lastUpdated = useQuery({
    queryKey: ["inventory", "last-updated"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_adjustments")
        .select("project_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of data ?? []) {
        if (!map.has(r.project_id)) map.set(r.project_id, r.created_at);
      }
      return map;
    },
  });

  const term = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!inv.data) return [];
    if (!term) return inv.data;
    return inv.data.filter((r) => {
      const hay = [
        r.projects?.mkj_number,
        r.projects?.name,
        r.products?.part_number,
        r.products?.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [inv.data, term]);

  const projectCards = useMemo(() => {
    const seen = new Map<string, { id: string; mkj: string; name: string }>();
    for (const r of filtered) {
      if (r.projects && !seen.has(r.project_id)) {
        seen.set(r.project_id, { id: r.project_id, mkj: r.projects.mkj_number, name: r.projects.name });
      }
    }
    return Array.from(seen.values());
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Inventory" description="On-hand quantities across every project you can see." />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search project, part # or description…"
          className="pl-9"
        />
      </div>

      {projectCards.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projectCards.map((p) => {
            const updated = lastUpdated.data?.get(p.id);
            return (
              <Link key={p.id} to="/projects/$mkj" params={{ mkj: p.mkj }}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="font-mono text-sm font-semibold text-primary">{p.mkj}</div>
                    <div className="mt-1 font-medium">{p.name}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last updated: {updated ? new Date(updated).toLocaleString() : "—"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Project</TableHead><TableHead>Part #</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">On Hand</TableHead><TableHead className="text-right">Reorder</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((r) => (
              <TableRow key={`${r.project_id}-${r.product_id}`}>
                <TableCell className="font-mono text-xs">{r.projects?.mkj_number}</TableCell>
                <TableCell className="font-mono">{r.products?.part_number}</TableCell>
                <TableCell>{r.products?.description}</TableCell>
                <TableCell className="text-right font-semibold">
                  {Number(r.on_hand)}
                  {r.products && Number(r.on_hand) <= (r.products.reorder_point ?? 0) ? <Badge variant="destructive" className="ml-2">Low</Badge> : null}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{r.products?.reorder_point ?? 0}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{term ? "No matches." : "No stock yet. Record a packing slip to receive goods."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
