import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Barcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchProjectSerials } from "@/lib/serials";

/**
 * Picks specific on-hand serials for a shipping-ticket line. Selection is
 * capped at the shipped quantity; picking fewer is allowed (warned, not blocked).
 */
export function SerialPickerDialog({
  projectId,
  productId,
  qty,
  selected,
  onChange,
  disabled,
}: {
  projectId: string;
  productId: string;
  qty: number;
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<string[]>(selected);

  const available = useQuery({
    queryKey: ["serials-available", projectId, productId],
    enabled: open && !!projectId && !!productId,
    queryFn: async () => (await fetchProjectSerials({ projectId, productId })).map((s) => s.serial),
  });

  // Serials already on the line stay listed even if stock moved on since.
  const options = useMemo(() => {
    const all = Array.from(new Set([...(available.data ?? []), ...selected]));
    all.sort((a, b) => a.localeCompare(b));
    const term = filter.trim().toLowerCase();
    return term ? all.filter((s) => s.toLowerCase().includes(term)) : all;
  }, [available.data, selected, filter]);

  function toggle(serial: string) {
    setDraft((d) => {
      if (d.includes(serial)) return d.filter((s) => s !== serial);
      if (d.length >= qty) return d;
      return [...d, serial];
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={disabled || !projectId || !productId}
        onClick={() => { setDraft(selected); setFilter(""); setOpen(true); }}
      >
        <Barcode className="mr-1 h-3.5 w-3.5" />
        {selected.length > 0 ? `${selected.length}/${qty} serials` : "Select serials"}
      </Button>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">
              {s}
              {!disabled ? (
                <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(selected.filter((x) => x !== s))}>
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {selected.length > 0 && selected.length < qty ? (
        <p className="text-[10px] text-status-partial-foreground">{qty - selected.length} unit(s) without a serial</p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select serial numbers</DialogTitle>
            <DialogDescription>
              Pick up to {qty} serial number(s) currently on hand for this project.
            </DialogDescription>
          </DialogHeader>

          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter serials…" />

          <div className="space-y-1">
            {available.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {!available.isLoading && options.length === 0 ? (
              <p className="text-sm text-muted-foreground">No serials recorded on hand for this part.</p>
            ) : null}
            {options.map((s) => {
              const checked = draft.includes(s);
              const full = !checked && draft.length >= qty;
              return (
                <label
                  key={s}
                  className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted", full && "cursor-not-allowed opacity-50")}
                >
                  <Checkbox checked={checked} disabled={full} onCheckedChange={() => toggle(s)} />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <span className="mr-auto self-center text-xs text-muted-foreground">{draft.length}/{qty} selected</span>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onChange(draft); setOpen(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
