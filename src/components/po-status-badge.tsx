import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type POStatus = Database["public"]["Enums"]["po_status"];

const CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  draft: {
    label: "Draft",
    badge: "bg-status-draft text-status-draft-foreground",
    dot: "bg-status-draft-foreground",
  },
  approved: {
    label: "Approved",
    badge: "bg-status-approved text-status-approved-foreground",
    dot: "bg-status-approved-foreground",
  },
  executed: {
    label: "Executed",
    badge: "bg-status-executed text-status-executed-foreground",
    dot: "bg-status-executed-foreground",
  },
  partially_received: {
    label: "Partially Received",
    badge: "bg-status-partial text-status-partial-foreground",
    dot: "bg-status-partial-foreground",
  },
  received: {
    label: "Received",
    badge: "bg-status-received text-status-received-foreground",
    dot: "bg-status-received-foreground",
  },
};

export function POStatusBadge({ status, className }: { status: POStatus | string; className?: string }) {
  const c = CONFIG[status] ?? {
    label: String(status).replace(/_/g, " "),
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        c.badge,
        className,
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", c.dot)} aria-hidden />
      {c.label}
    </span>
  );
}

export const PO_STATUS_OPTIONS: { value: POStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "executed", label: "Executed" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
];
