import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown } from "lucide-react";

export type ProjectOption = { id: string; mkj_number: string; name: string | null };

export function ProjectMultiSelect({
  projects,
  selected,
  onToggle,
}: {
  projects: ProjectOption[];
  selected: Set<string>;
  onToggle: (projectId: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = projects.filter((p) => selected.has(p.id));

  if (projects.length === 0) {
    return <span className="text-xs text-muted-foreground">No projects created yet.</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-64 justify-between font-normal">
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {chosen.length === 0 ? (
              <span className="text-muted-foreground">Select projects</span>
            ) : chosen.length <= 2 ? (
              chosen.map((p) => (
                <Badge key={p.id} variant="secondary" className="font-mono text-xs">
                  {p.mkj_number}
                </Badge>
              ))
            ) : (
              <span className="text-xs">{chosen.length} projects selected</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects…" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              {projects.map((p) => {
                const on = selected.has(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.mkj_number} ${p.name ?? ""}`}
                    onSelect={() => onToggle(p.id, !on)}
                  >
                    <Checkbox checked={on} className="mr-2 pointer-events-none" />
                    <span className="font-mono text-xs">{p.mkj_number}</span>
                    {p.name ? <span className="ml-2 truncate text-xs text-muted-foreground">{p.name}</span> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
