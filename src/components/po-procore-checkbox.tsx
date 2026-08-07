import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useState } from "react";
import { useRoles } from "@/hooks/use-session";
import { isWarehouseOrAdmin } from "@/lib/roles";

/** POs at or past "executed" are expected to already be entered in Procore. */
export function needsProcoreEntry(status: string, entered: boolean): boolean {
  return !entered && (status === "executed" || status === "partially_received" || status === "received");
}

export function PoProcoreCheckbox({
  poId,
  entered,
  id,
}: {
  poId: string;
  entered: boolean;
  id?: string;
}) {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const canToggle = isWarehouseOrAdmin(roles);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? entered;

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from("purchase_orders").update({ entered_in_procore: next }).eq("id", poId);
      if (error) throw error;
    },
    onSuccess: () => {
      setOptimistic(null);
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["po", poId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => {
      setOptimistic(null);
      toast.error(e.message);
    },
  });

  return (
    <Checkbox
      id={id}
      checked={checked}
      disabled={!canToggle || toggle.isPending}
      aria-label="Entered in Procore"
      onCheckedChange={(v) => {
        const next = v === true;
        setOptimistic(next);
        toggle.mutate(next);
      }}
    />
  );
}
