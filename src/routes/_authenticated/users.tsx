import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & Roles — MKJ Ops" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: adminRow } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!adminRow) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

const ALL_ROLES: AppRole[] = ["admin", "warehouse_manager", "manager", "engineer"];

function UsersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);



  const users = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [profilesRes, rolesRes, pmRes, peRes, projectsRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("project_managers").select("user_id, project_id"),
        supabase.from("project_engineers").select("user_id, project_id"),
        supabase.from("projects").select("id, mkj_number, name").order("mkj_number"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const rolesByUser = new Map<string, AppRole[]>();
      (rolesRes.data ?? []).forEach((r) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        rolesByUser.set(r.user_id, arr);
      });
      const managerProjects = new Map<string, string[]>();
      (pmRes.data ?? []).forEach((r) => {
        const arr = managerProjects.get(r.user_id) ?? [];
        arr.push(r.project_id);
        managerProjects.set(r.user_id, arr);
      });
      const engineerProjects = new Map<string, string[]>();
      (peRes.data ?? []).forEach((r) => {
        const arr = engineerProjects.get(r.user_id) ?? [];
        arr.push(r.project_id);
        engineerProjects.set(r.user_id, arr);
      });
      return {
        profiles: profilesRes.data ?? [],
        roles: rolesByUser,
        managerProjects,
        engineerProjects,
        projects: projectsRes.data ?? [],
      };
    },
  });

  const setRoleMut = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Name updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["all-users"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAssignmentMut = useMutation({
    mutationFn: async ({ userId, projectId, table, on }: { userId: string; projectId: string; table: "project_managers" | "project_engineers"; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from(table).insert({ user_id: userId, project_id: projectId });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from(table).delete().eq("user_id", userId).eq("project_id", projectId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Users & Roles" description="Admin-only. Assign each user a role and the projects they work on." />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Project assignments</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.data ? users.data.profiles.map((u) => {
              const rs = users.data.roles.get(u.id) ?? [];
              const currentRole = rs[0];
              const isManager = currentRole === "manager";
              const isEngineer = currentRole === "engineer";
              const table = isManager ? "project_managers" : isEngineer ? "project_engineers" : null;
              const assigned = new Set(
                isManager ? users.data.managerProjects.get(u.id) ?? []
                : isEngineer ? users.data.engineerProjects.get(u.id) ?? []
                : []
              );
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium">{u.full_name ?? u.email}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Edit name"
                        onClick={() => setEditing({ id: u.id, name: u.full_name ?? "" })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {currentRole ? <Badge>{ROLE_LABELS[currentRole]}</Badge> : <Badge variant="outline">None</Badge>}
                      <Select value={currentRole ?? ""} onValueChange={(v) => setRoleMut.mutate({ userId: u.id, role: v as AppRole })}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Set role" /></SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    {table ? (
                      <div className="flex flex-wrap gap-2">
                        {users.data.projects.map((p) => {
                          const on = assigned.has(p.id);
                          return (
                            <label key={p.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                              <Checkbox checked={on} onCheckedChange={(v) => toggleAssignmentMut.mutate({ userId: u.id, projectId: p.id, table, on: v === true })} />
                              <span className="font-mono">{p.mkj_number}</span>
                            </label>
                          );
                        })}
                        {users.data.projects.length === 0 ? <span className="text-xs text-muted-foreground">No projects created yet.</span> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Admins & Warehouse Managers see every project.</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            }) : <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <p className="mt-3 text-xs text-muted-foreground">Users appear here once they create an account from the sign-in page.</p>
      <div className="mt-2"><Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["all-users"] })}>Refresh</Button></div>
    </div>
  );
}
