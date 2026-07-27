import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { POStatusBadge } from "@/components/po-status-badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/projects/$mkj")({
  head: ({ params }) => ({ meta: [{ title: `${params.mkj} — MKJ Ops` }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { mkj } = Route.useParams();

  const project = useQuery({
    queryKey: ["project", mkj],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("mkj_number", mkj).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const inventory = useQuery({
    queryKey: ["inventory", project.data?.id],
    enabled: !!project.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_inventory")
        .select("product_id, on_hand, products:product_id(part_number, description, unit, reorder_point)")
        .eq("project_id", project.data!.id);
      if (error) throw error;
      return data as unknown as Array<{
        product_id: string;
        on_hand: number;
        products: { part_number: string; description: string; unit: string; reorder_point: number } | null;
      }>;
    },
  });

  const pos = useQuery({
    queryKey: ["po-list", project.data?.id],
    enabled: !!project.data,
    queryFn: async () => {
      const { data } = await supabase.from("purchase_orders").select("id, po_number, status, delivery_date, created_at").eq("project_id", project.data!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const tickets = useQuery({
    queryKey: ["st-list", project.data?.id],
    enabled: !!project.data,
    queryFn: async () => {
      const { data } = await supabase.from("shipping_tickets").select("id, ticket_number, status, ship_date, deliver_to_name").eq("project_id", project.data!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (project.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!project.data) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  const p = project.data;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`${p.mkj_number} — ${p.name}`}
        description={p.contract_number ? `Contract ${p.contract_number}` : undefined}
        actions={<Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="pos">Purchase Orders</TabsTrigger>
          <TabsTrigger value="tickets">Shipping Tickets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">MKJ #: </span><span className="font-mono">{p.mkj_number}</span></div>
                <div><span className="text-muted-foreground">Contract: </span>{p.contract_number ?? "—"}</div>
                <div><span className="text-muted-foreground">Status: </span>{p.status}</div>
                <div><span className="text-muted-foreground">Created: </span>{new Date(p.created_at).toLocaleDateString()}</div>
              </CardContent>
            </Card>
            {p.description ? (
              <Card>
                <CardHeader><CardTitle>Description</CardTitle></CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">{p.description}</CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="pt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.data && inventory.data.length > 0 ? (
                    inventory.data.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell className="font-mono">{r.products?.part_number}</TableCell>
                        <TableCell>{r.products?.description}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {Number(r.on_hand)}
                          {r.products && Number(r.on_hand) <= (r.products.reorder_point ?? 0) ? (
                            <Badge variant="destructive" className="ml-2">Low</Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.products?.reorder_point ?? 0}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No inventory yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos" className="pt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.data && pos.data.length > 0 ? pos.data.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell><Link className="font-mono text-primary hover:underline" to="/purchase-orders/$id" params={{ id: po.id }}>{po.po_number}</Link></TableCell>
                      <TableCell><POStatusBadge status={po.status} /></TableCell>
                      <TableCell>{po.delivery_date ?? "—"}</TableCell>
                      <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => toast.info("PDF view coming soon")}>View PO</Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No POs yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="pt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deliver to</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.data && tickets.data.length > 0 ? tickets.data.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell><Link className="font-mono text-primary hover:underline" to="/shipping-tickets/$id" params={{ id: t.id }}>{t.ticket_number}</Link></TableCell>
                      <TableCell><Badge variant="secondary">{t.status}</Badge></TableCell>
                      <TableCell>{t.deliver_to_name ?? "—"}</TableCell>
                      <TableCell>{t.ship_date}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No tickets yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
