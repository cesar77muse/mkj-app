import { supabase } from "@/integrations/supabase/client";

/**
 * Packing-slip lines often come from PO lines that were typed free-hand and have
 * no product_id. Without a product we can't move inventory, so resolve (or create)
 * a catalog product from the line's part number / description.
 */
export async function resolveProductId(opts: {
  productId?: string | null;
  partNumber?: string | null;
  description: string;
  unit?: string | null;
}): Promise<string | null> {
  if (opts.productId) return opts.productId;
  const key = (opts.partNumber || opts.description || "").trim();
  if (!key) return null;

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .or(`part_number.ilike.${key},description.ilike.${key}`)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      part_number: key,
      description: opts.description || key,
      unit: opts.unit || "ea",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export type SlipInventoryLine = {
  product_id: string | null;
  qty_received: number;
};

/**
 * Reconcile inventory movements for a packing slip against its current line
 * items. inventory_adjustments is an append-only ledger (no DELETE grant), so
 * this calls a SECURITY DEFINER RPC that inserts only the delta needed to
 * bring the ledger in line with `packing_slip_items` — safe to call after
 * every save, including saves that change nothing.
 */
export async function syncSlipInventory(params: {
  slipId: string;
  slipNumber: string;
  projectId: string;
  lines: SlipInventoryLine[];
  userId: string | null;
}) {
  const { error } = await supabase.rpc("sync_packing_slip_inventory", { _slip_id: params.slipId });
  if (error) throw error;
}

export function slipStatusFor(lines: { qty_ordered: number; qty_received: number }[]): "received" | "partially_received" {
  return lines.some((l) => l.qty_received < l.qty_ordered) ? "partially_received" : "received";
}

/**
 * Recompute a PO's received status from every packing slip logged against it.
 *
 * Receiving never sets Approved/Executed — those stay manual. The PO's status
 * from just before its first receipt is stashed in `pre_receipt_status` so the
 * PO can fall back to it if every receipt is later removed/zeroed out.
 */
export async function refreshPoStatus(poId: string) {
  const [{ data: po }, { data: poItems }, { data: slipItems }] = await Promise.all([
    supabase.from("purchase_orders").select("status, pre_receipt_status").eq("id", poId).maybeSingle(),
    supabase.from("purchase_order_items").select("id, qty").eq("po_id", poId),
    supabase
      .from("packing_slip_items")
      .select("po_item_id, qty_received, packing_slips!inner(po_id)")
      .eq("packing_slips.po_id", poId),
  ]);
  const received = new Map<string, number>();
  (slipItems ?? []).forEach((s) => {
    if (!s.po_item_id) return;
    received.set(s.po_item_id, (received.get(s.po_item_id) ?? 0) + Number(s.qty_received));
  });

  const anyReceived = [...received.values()].some((q) => q > 0);
  if (!anyReceived) {
    if (!po?.pre_receipt_status) {
      // Unknown pre-receipt status (this PO's first receipt predates the
      // column) — don't guess a status, leave it for a human to correct.
      return;
    }
    // No receipts left — revert to whatever the PO was before the first one.
    await supabase
      .from("purchase_orders")
      .update({ status: po.pre_receipt_status, pre_receipt_status: null })
      .eq("id", poId);
    return;
  }

  const anyOpen = (poItems ?? []).some((i) => (received.get(i.id) ?? 0) < Number(i.qty));
  const isReceipt = po?.status === "received" || po?.status === "partially_received";
  await supabase
    .from("purchase_orders")
    .update({
      status: anyOpen ? "partially_received" : "received",
      // Only capture the pre-receipt status on the first receipt.
      ...(po && !isReceipt && !po.pre_receipt_status ? { pre_receipt_status: po.status } : {}),
    })
    .eq("id", poId);
}

