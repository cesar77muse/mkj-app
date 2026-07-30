import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { canWrite as canWriteRoles } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — MKJ Ops" }] }),
  component: SuppliersPage,
});

type SupplierForm = { name: string; address: string; phone: string; contact_name: string; email: string };
const emptyForm: SupplierForm = { name: "", address: "", phone: "", contact_name: "", email: "" };

function SuppliersPage() {
  const { data: roles = [] } = useRoles();
  const canWrite = canWriteRoles(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(emptyForm);

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier added");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          phone: editForm.phone.trim() || null,
          contact_name: editForm.contact_name.trim() || null,
          email: editForm.email.trim() || null,
        })
        .eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier updated");
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Suppliers"
        description="Vendors and contract companies referenced by purchase orders."
        actions={canWrite ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Contact</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate()} disabled={!form.name.trim() || createMut.isPending}>{createMut.isPending ? "Adding…" : "Add"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead>
            {canWrite ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
          </TableRow></TableHeader>
          <TableBody>
            {suppliers.data && suppliers.data.length > 0 ? suppliers.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.contact_name ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell>{s.email ?? "—"}</TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => {
                        setEditId(s.id);
                        setEditForm({
                          name: s.name ?? "",
                          address: s.address ?? "",
                          phone: s.phone ?? "",
                          contact_name: s.contact_name ?? "",
                          email: s.email ?? "",
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            )) : <TableRow><TableCell colSpan={canWrite ? 5 : 4} className="py-6 text-center text-sm text-muted-foreground">No suppliers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={editId !== null} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              {!editForm.name.trim() ? <p className="mt-1 text-xs text-destructive">Name is required.</p> : null}
            </div>
            <div><Label>Address</Label><Textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact</Label><Input value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={() => updateMut.mutate()} disabled={!editForm.name.trim() || updateMut.isPending}>{updateMut.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
