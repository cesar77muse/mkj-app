import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useRoles } from "@/hooks/use-session";
import { isAdmin, isWarehouseOrAdmin, type AppRole } from "@/lib/roles";

/** Admins can delete any ticket; warehouse managers only while it is not delivered. */
export function canDeleteTicket(roles: AppRole[], status: string): boolean {
  if (isAdmin(roles)) return true;
  if (!isWarehouseOrAdmin(roles)) return false;
  return status !== "delivered" && status !== "closed";
}

export function ShippingTicketDeleteButton({
  ticketId, ticketNumber, status, variant = "icon", onDeleted,
}: {
  ticketId: string;
  ticketNumber?: string | null;
  status: string;
  variant?: "icon" | "button";
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const roles = useRoles().data ?? [];
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: async () => {
      // Single RPC: reverses any shipped inventory, then removes items + ticket atomically.
      const { error } = await supabase.rpc("delete_shipping_ticket", { _ticket_id: ticketId } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shipping ticket deleted");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setOpen(false);
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete this shipping ticket"),
  });

  if (!canDeleteTicket(roles, status)) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Delete shipping ticket" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="destructive"><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {ticketNumber ?? "this shipping ticket"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the shipping ticket and its line items. If any items were already
            shipped, they'll be returned to inventory. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={del.isPending}
            onClick={(e) => { e.preventDefault(); del.mutate(); }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
