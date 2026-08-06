import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssigneeOption = { id: string; full_name: string | null };

/** Any user carrying at least one role — valid PO assignees. */
export function useAssignableUsers() {
  return useQuery({
    queryKey: ["assignable-users"],
    queryFn: async (): Promise<AssigneeOption[]> => {
      // v_user_roles, not user_roles directly: the raw table is self-scoped
      // RLS, which would collapse this to "just me" for any non-admin (L-04).
      const { data: roleRows, error: roleErr } = await supabase.from("v_user_roles").select("user_id");
      if (roleErr) throw roleErr;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id).filter((id): id is string => !!id)));
      if (ids.length === 0) return [];
      // user_directory exposes names only — emails stay restricted to the owner and admins
      const { data, error } = await supabase
        .from("user_directory").select("id, full_name").in("id", ids).order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function assigneeLabel(u?: AssigneeOption | null) {
  if (!u) return "Unassigned";
  return u.full_name || "Unknown user";
}

export function AssigneeSelect({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
}) {
  const { data: users = [], isLoading } = useAssignableUsers();
  const [open, setOpen] = useState(false);
  const selected = users.find((u) => u.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {isLoading ? "Loading users…" : selected ? assigneeLabel(selected) : "Select an assignee (optional)"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users…" />
          <CommandList>
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup>
              {users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.full_name ?? u.id}
                  onSelect={() => {
                    onChange(u.id === value ? null : u.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === u.id ? "opacity-100" : "opacity-0")} />
                  {assigneeLabel(u)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
