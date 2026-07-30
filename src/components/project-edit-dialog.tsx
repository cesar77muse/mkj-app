import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { isAdmin } from "@/lib/roles";
import { ProjectManagerSelect } from "@/components/project-manager-select";

type Project = {
  id: string;
  mkj_number: string;
  name: string;
  contract_number: string | null;
  description: string | null;
  status: string;
  project_manager_id?: string | null;
};

type ProjectStatus = "active" | "closed" | "on_hold";

/** Only admins can edit project details. */
export function ProjectEditDialog({ project, variant = "icon" }: { project: Project; variant?: "icon" | "button" }) {
  const { data: roles = [] } = useRoles();
  const [open, setOpen] = useState(false);

  if (!isAdmin(roles)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit project"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" />Edit</Button>
        )}
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <ProjectEditForm project={project} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectEditForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const qc = useQueryClient();
  const [mkj, setMkj] = useState(project.mkj_number);
  const [name, setName] = useState(project.name);
  const [contract, setContract] = useState(project.contract_number ?? "");
  const [desc, setDesc] = useState(project.description ?? "");
  const [status, setStatus] = useState(project.status);
  const [managerId, setManagerId] = useState<string | null>(project.project_manager_id ?? null);

  useEffect(() => {
    setMkj(project.mkj_number);
    setName(project.name);
    setContract(project.contract_number ?? "");
    setDesc(project.description ?? "");
    setStatus(project.status);
    setManagerId(project.project_manager_id ?? null);
  }, [project]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({
          mkj_number: mkj.trim().toUpperCase(),
          name: name.trim(),
          contract_number: contract.trim() || null,
          description: desc.trim() || null,
          status: status as ProjectStatus,
          project_manager_id: managerId,
        })
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project updated");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit project</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="e-mkj">Job #</Label>
          <Input id="e-mkj" value={mkj} onChange={(e) => setMkj(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="e-name">Name</Label>
          <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="e-contract">Contract number</Label>
          <Input id="e-contract" value={contract} onChange={(e) => setContract(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="e-pm">Project manager</Label>
          <ProjectManagerSelect id="e-pm" value={managerId} onChange={setManagerId} />
        </div>
        <div>
          <Label htmlFor="e-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="e-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="on_hold">on_hold</SelectItem>
              <SelectItem value="closed">closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="e-desc">Description</Label>
          <Textarea id="e-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={!mkj || !name || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
