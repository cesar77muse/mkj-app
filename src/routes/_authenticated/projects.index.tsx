import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { isWarehouseOrAdmin } from "@/lib/roles";
import { ProjectManagerSelect, managerLabel, useManagers } from "@/components/project-manager-select";


export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — MKJ Ops" }] }),
  component: ProjectsList,
});

function ProjectsList() {
  const { data: roles = [] } = useRoles();
  const canCreate = isWarehouseOrAdmin(roles);
  const qc = useQueryClient();

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [mkj, setMkj] = useState("");
  const [name, setName] = useState("");
  const [contract, setContract] = useState("");
  const [desc, setDesc] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);

  const { data: managers = [] } = useManagers();

  const createMut = useMutation({
    mutationFn: async () => {
      if (!managerId) throw new Error("Select a project manager");
      const { error } = await supabase.from("projects").insert({
        mkj_number: mkj.trim().toUpperCase(),
        name: name.trim(),
        contract_number: contract.trim() || null,
        description: desc.trim() || null,
        project_manager_id: managerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setMkj(""); setName(""); setContract(""); setDesc(""); setManagerId(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projects"
        description="Every purchase order, packing slip, and shipping ticket is scoped to a project."
        actions={
          canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-1 h-4 w-4" /> New Project</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New project</DialogTitle>
                  <DialogDescription>Use the job number (e.g. 2403).</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="mkj">Job #</Label>
                    <Input id="mkj" value={mkj} onChange={(e) => setMkj(e.target.value)} placeholder="2403" />
                  </div>
                  <div>
                    <Label htmlFor="pname">Name</Label>
                    <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="37 Elevators Forte" />
                  </div>
                  <div>
                    <Label htmlFor="contract">Contract number</Label>
                    <Input id="contract" value={contract} onChange={(e) => setContract(e.target.value)} placeholder="E-34054" />
                  </div>
                  <div>
                    <Label htmlFor="pm">Project manager</Label>
                    <ProjectManagerSelect id="pm" value={managerId} onChange={setManagerId} />
                  </div>
                  <div>
                    <Label htmlFor="pdesc">Description</Label>
                    <Textarea id="pdesc" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => createMut.mutate()} disabled={!mkj || !name || !managerId || createMut.isPending}>

                    {createMut.isPending ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.data && projects.data.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((p) => (
            <Link key={p.id} to="/projects/$mkj" params={{ mkj: p.mkj_number }}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-sm font-semibold text-primary">{p.mkj_number}</div>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </div>
                  <div className="mt-1 font-medium">{p.name}</div>
                  {p.contract_number ? <div className="mt-1 text-xs text-muted-foreground">Contract {p.contract_number}</div> : null}
                  {p.description ? <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</div> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No projects yet. {canCreate ? "Create the first one to get started." : "Ask an admin to create your first project."}</CardContent></Card>
      )}
    </div>
  );
}
