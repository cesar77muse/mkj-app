import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const SHIPPING_TICKET_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "closed", label: "Closed" },
] as const;

export type ShippingTicketStatus = (typeof SHIPPING_TICKET_STATUSES)[number]["value"];

export function shippingTicketStatusLabel(status: string): string {
  return SHIPPING_TICKET_STATUSES.find((s) => s.value === status)?.label ?? status.replace(/_/g, " ");
}

/** Closed = signed ticket on file; rendered distinctly from the in-flight statuses. */
export function ShippingTicketStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant={status === "closed" ? "outline" : "secondary"}
      className={cn("capitalize", status === "closed" && "border-primary/40 text-primary", className)}
    >
      {shippingTicketStatusLabel(status)}
    </Badge>
  );
}
