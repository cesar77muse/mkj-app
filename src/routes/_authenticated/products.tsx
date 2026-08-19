import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { Plus, Search, Pencil } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { isWarehouseOrAdmin } from "@/lib/roles";
import { useSerialSupport } from "@/lib/serials";

type Product = {
  id: string; part_number: string; description: string; unit: string; reorder_point: number;
  is_serialized?: boolean | null;
};

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — MKJ Ops" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { data: roles = [] } = useRoles();
  const canWrite = isWarehouseOrAdmin(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pn, setPn] = useState("");
  const [desc, setDesc] = useState("");
  const [unit, setUnit] = useState("ea");
  const [rp, setRp] = useState<number>(0);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("part_number");
      if (error) throw error;
      return data;
    },
  });

  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!products.data) return [];
    if (!term) return products.data;
    return products.data.filter((p) => {
      const hay = [p.part_number, p.description].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [products.data, term]);

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        part_number: pn.trim(),
        description: desc.trim(),
        unit: unit.trim() || "ea",
        reorder_point: rp,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product added");
      setOpen(false);
      setPn(""); setDesc(""); setUnit("ea"); setRp(0);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [ePn, setEPn] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eUnit, setEUnit] = useState("ea");
  const [eRp, setERp] = useState<number>(0);

  function openEdit(p: Product) {
    setEditing(p);
    setEPn(p.part_number);
    setEDesc(p.description);
    setEUnit(p.unit);
    setERp(p.reorder_point);
  }

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("products")
        .update({ part_number: ePn.trim(), description: eDesc.trim(), unit: eUnit.trim() || "ea", reorder_point: eRp })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Products"
        description="Catalog of parts. Inventory quantities are tracked per project."
        actions={canWrite ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New Product</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label htmlFor="pn">Part number</Label><Input id="pn" value={pn} onChange={(e) => setPn(e.target.value)} placeholder="WV-S35302-F2L" /></div>
                <div><Label htmlFor="pdesc">Description</Label><Input id="pdesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="2MP OUTDOOR VANDAL DOME CAM" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="unit">Unit</Label><Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
                  <div><Label htmlFor="rp">Reorder point</Label><Input id="rp" type="number" min={0} step={1} inputMode="numeric" value={rp} onChange={(e) => setRp(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate()} disabled={!pn || !desc || createMut.isPending}>{createMut.isPending ? "Adding…" : "Add"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search part # or description…"
          className="pl-9"
        />
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Part #</TableHead><TableHead>Description</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Reorder point</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length > 0 ? filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.part_number}</TableCell>
                <TableCell>{p.description}</TableCell>
                <TableCell>{p.unit}</TableCell>
                <TableCell className="text-right">{p.reorder_point}</TableCell>
                <TableCell className="text-right">
                  {canWrite ? (
                    <Button size="icon" variant="ghost" aria-label="Edit product" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{term ? "No matches." : "No products yet."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="e-pn">Part number</Label><Input id="e-pn" value={ePn} onChange={(e) => setEPn(e.target.value)} /></div>
            <div><Label htmlFor="e-pdesc">Description</Label><Input id="e-pdesc" value={eDesc} onChange={(e) => setEDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="e-unit">Unit</Label><Input id="e-unit" value={eUnit} onChange={(e) => setEUnit(e.target.value)} /></div>
              <div><Label htmlFor="e-rp">Reorder point</Label><Input id="e-rp" type="number" min={0} step={1} inputMode="numeric" value={eRp} onChange={(e) => setERp(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editMut.mutate()} disabled={!ePn.trim() || !eDesc.trim() || editMut.isPending}>{editMut.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
