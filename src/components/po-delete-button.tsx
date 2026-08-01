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

/** Admins can delete any PO; warehouse managers only while the PO is not fully received. */
export function canDeletePO(roles: AppRole[], status: string): boolean {
  if (isAdmin(roles)) return true;
  if (!isWarehouseOrAdmin(roles)) return false;
  return status !== "received";
}

export function PODeleteButton({
  poId, poNumber, status, variant = "icon", onDeleted,
}: {
  poId: string;
  poNumber?: string | null;
  status: string;
  variant?: "icon" | "button";
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const roles = useRoles().data ?? [];
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_purchase_order", { _po_id: poId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase order deleted");
      qc.invalidateQueries({ queryKey: ["pos"] });
      setOpen(false);
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete this purchase order"),
  });

  if (!canDeletePO(roles, status)) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Delete purchase order" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="destructive"><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {poNumber ?? "this purchase order"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the purchase order and all of its line items. This action cannot be undone.
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
