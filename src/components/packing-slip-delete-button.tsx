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
import { isWarehouseOrAdmin } from "@/lib/roles";
import { refreshPoStatus } from "@/lib/receiving";

export function PackingSlipDeleteButton({
  slipId, slipNumber, poId, variant = "icon", onDeleted,
}: {
  slipId: string;
  slipNumber?: string | null;
  poId: string;
  variant?: "icon" | "button";
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const roles = useRoles().data ?? [];
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: async () => {
      // Single RPC: reverses any received inventory, then removes items + slip atomically.
      const { error } = await supabase.rpc("delete_packing_slip", { _slip_id: slipId } as never);
      if (error) throw error;
      // The PO's received/partially-received status depends on this slip's
      // contribution — recompute it now that the slip is gone.
      await refreshPoStatus(poId);
    },
    onSuccess: () => {
      toast.success("Packing slip deleted");
      qc.invalidateQueries({ queryKey: ["packing-slips"] });
      qc.invalidateQueries({ queryKey: ["po-slips", poId] });
      qc.invalidateQueries({ queryKey: ["po", poId] });
      setOpen(false);
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete this packing slip"),
  });

  if (!isWarehouseOrAdmin(roles)) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button size="icon" variant="ghost" aria-label="Delete packing slip" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" variant="destructive"><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {slipNumber ?? "this packing slip"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the packing slip and its line items. Any inventory it added will be
            reversed, and the purchase order's received status will be recalculated. This action cannot be undone.
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
