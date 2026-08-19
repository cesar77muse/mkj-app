import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";
import { countFilled, duplicateIndexes, normalizeSerial } from "@/lib/serials";

/**
 * One input per received unit. Serials are optional everywhere — blanks are
 * allowed and never block a save. Enter jumps to the next box so a barcode
 * scanner (which sends Enter after each scan) can run straight through a line.
 */
export function SerialNumberInputs({
  values,
  onChange,
  disabled,
  idPrefix,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const dups = duplicateIndexes(values);
  const filled = countFilled(values);

  function setAt(i: number, v: string) {
    onChange(values.map((x, idx) => (idx === i ? v : x)));
  }

  function pasteList(text: string, startIndex: number) {
    const parts = text
      .split(/[\r\n,;\t]+/)
      .map(normalizeSerial)
      .filter(Boolean);
    if (parts.length <= 1) return false;
    const next = [...values];
    parts.forEach((p, k) => {
      const target = startIndex + k;
      if (target < next.length) next[target] = p;
    });
    onChange(next);
    return true;
  }

  if (values.length === 0) {
    return <p className="text-xs text-muted-foreground">Set a quantity to enter serial numbers.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={cn(filled < values.length && "text-status-partial-foreground")}>
          {filled}/{values.length} serials
        </span>
        {filled < values.length ? <span>· optional, leave blank for bulk items</span> : null}
        {!disabled ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (!pasteList(text, 0)) {
                  const one = normalizeSerial(text);
                  if (one) setAt(0, one);
                }
              } catch {
                // Clipboard permission denied — user can still paste into a box.
              }
            }}
          >
            <ClipboardPaste className="mr-1 h-3.5 w-3.5" />Paste list
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {values.map((v, i) => (
          <div key={`${idPrefix}-${i}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <Input
              ref={(el) => { refs.current[i] = el; }}
              value={v}
              disabled={disabled}
              placeholder="Serial number"
              aria-label={`Serial number ${i + 1}`}
              className={cn("h-8 font-mono text-xs", dups.has(i) && "border-destructive")}
              onChange={(e) => setAt(i, e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (pasteList(text, i)) e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  refs.current[i + 1]?.focus();
                }
              }}
            />
          </div>
        ))}
      </div>

      {dups.size > 0 ? (
        <p className="text-xs text-destructive">Duplicate serial numbers on this line are highlighted.</p>
      ) : null}
    </div>
  );
}
