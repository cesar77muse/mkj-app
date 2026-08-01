
-- ============ FIX F-01: PACKING SLIP INVENTORY DOUBLE-COUNTING ============
-- syncSlipInventory() previously deleted the slip's existing
-- inventory_adjustments rows client-side, then re-inserted them. But
-- inventory_adjustments only grants SELECT/INSERT to authenticated (no
-- DELETE policy, by design — it's an append-only ledger). The delete
-- silently removed nothing (its error was never checked), so every save
-- of the packing-slip edit dialog added the received quantities again.
--
-- sync_packing_slip_inventory() reconciles the ledger toward "net matches
-- current qty_received per product" the same way ship_shipping_ticket_inventory()
-- already does for shipping tickets (see migration 20260801215648): it
-- computes the delta between what's currently recorded for this slip and
-- what the slip's line items say now, and inserts only that delta. Safe to
-- call more than once for the same slip — a second call with unchanged
-- lines inserts nothing.
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
    WHERE slip_id = _slip_id AND product_id IS NOT NULL AND qty_received > 0
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
