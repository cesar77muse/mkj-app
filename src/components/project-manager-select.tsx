import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ManagerOption = { id: string; full_name: string | null; email: string | null };

/** Users that carry the "manager" role — the only valid project managers. */
export function useManagers() {
  return useQuery({
    queryKey: ["manager-users"],
    queryFn: async (): Promise<ManagerOption[]> => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles").select("user_id").eq("role", "manager");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      // user_directory exposes names only — emails stay restricted to the owner and admins
      const { data, error } = await supabase
        .from("user_directory").select("id, full_name").in("id", ids).order("full_name");
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, email: null }));
    },
  });
}

export function managerLabel(m?: ManagerOption | null) {
  if (!m) return "Unassigned";
  return m.full_name || m.email || "Unknown user";
}

export function ProjectManagerSelect({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
}) {
  const { data: managers = [], isLoading } = useManagers();
  const [open, setOpen] = useState(false);
  const selected = managers.find((m) => m.id === value) ?? null;

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
            {isLoading ? "Loading managers…" : selected ? managerLabel(selected) : "Select a project manager"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search managers…" />
          <CommandList>
            <CommandEmpty>No manager found.</CommandEmpty>
            <CommandGroup>
              {managers.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.full_name ?? ""} ${m.email ?? ""}`}
                  onSelect={() => {
                    onChange(m.id === value ? null : m.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <div>{managerLabel(m)}</div>
                    {m.email ? <div className="text-xs text-muted-foreground">{m.email}</div> : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
