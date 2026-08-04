
-- ============ FIX F-08: DAMAGED / REJECTED GOODS STILL INCREASED STOCK ============
-- Packing slip lines carry a per-line `condition` (ok / damaged / rejected),
-- but sync_packing_slip_inventory() (migration 20260801220000) only checked
-- qty_received > 0 when deciding how much to add to on-hand -- ignoring
-- condition entirely. Receiving 10 units with 3 marked damaged added all 10
-- to on-hand as if they were usable stock.
--
-- Only 'ok' quantity should count toward on-hand inventory. Damaged/rejected
-- quantity still counts as *received* for PO/backorder purposes (the
-- shipment did arrive, so the PO line should still close out and the
-- backorder should still clear) -- that logic (slipStatusFor,
-- refreshPoStatus) is untouched here, deliberately: it's a different
-- concept ("did it arrive") from "is it usable stock."
--
-- This is a forward-only fix: because sync_packing_slip_inventory()
-- reconciles a slip's ledger to match its *current* line items every time
-- it's called, any slip saved after this migration self-corrects
-- automatically. Slips already received with damaged/rejected lines keep
-- their existing (over-counted) on-hand contribution until that specific
-- slip is next edited and saved, or corrected with a manual adjustment --
-- deliberately not backfilled here to avoid an unannounced, company-wide
-- drop in on-hand numbers.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_packing_slip_inventory(_slip_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slip public.packing_slips;
  _actor UUID := auth.uid();
BEGIN
  SELECT * INTO _slip FROM public.packing_slips WHERE id = _slip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packing slip not found';
  END IF;

  IF NOT public.can_write_project(_actor, _slip.project_id) THEN
    RAISE EXCEPTION 'Not permitted to modify inventory for this packing slip';
  END IF;

  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  SELECT
    _slip.project_id,
    COALESCE(w.product_id, e.product_id),
    COALESCE(w.qty_received, 0) - COALESCE(e.net, 0),
    'packing_slip',
    _slip_id,
    'Received on slip ' || _slip.slip_number,
    _actor
  FROM (
    SELECT product_id, SUM(qty_received) AS qty_received
    FROM public.packing_slip_items
    WHERE slip_id = _slip_id AND product_id IS NOT NULL AND qty_received > 0 AND condition = 'ok'
    GROUP BY product_id
  ) w
  FULL OUTER JOIN (
    SELECT product_id, SUM(delta) AS net
    FROM public.inventory_adjustments
    WHERE source_type = 'packing_slip' AND source_id = _slip_id
    GROUP BY product_id
  ) e ON e.product_id = w.product_id
  WHERE COALESCE(w.qty_received, 0) - COALESCE(e.net, 0) <> 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_packing_slip_inventory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_packing_slip_inventory(UUID) TO authenticated;

COMMIT;
