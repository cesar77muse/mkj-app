import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — MKJ Ops" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const inv = useQuery({
    queryKey: ["inventory", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_inventory")
        .select("project_id, product_id, on_hand, projects:project_id(mkj_number, name), products:product_id(part_number, description, reorder_point)");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        project_id: string; product_id: string; on_hand: number;
        projects: { mkj_number: string; name: string } | null;
        products: { part_number: string; description: string; reorder_point: number } | null;
      }>;
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Inventory" description="On-hand quantities across every project you can see." />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Project</TableHead><TableHead>Part #</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">On Hand</TableHead><TableHead className="text-right">Reorder</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {inv.data && inv.data.length > 0 ? inv.data.map((r) => (
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
            )) : <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No stock yet. Record a packing slip to receive goods.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
