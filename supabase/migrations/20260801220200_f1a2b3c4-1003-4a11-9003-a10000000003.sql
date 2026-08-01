
-- ============ FIX F-04: SAFE PURCHASE ORDER DELETE ============
-- PODeleteButton previously deleted purchase_order_items then
-- purchase_orders directly from the client. Two problems: (1)
-- packing_slips.po_id is ON DELETE RESTRICT, so any PO that has ever been
-- received fails with a raw Postgres FK error surfaced in a toast; (2) on
-- a PO with no slips it "succeeds", but there was no path to unwind
-- packing-slip-derived inventory_adjustments if slips existed, leaving
-- stock on the books for a PO that no longer exists.
--
-- delete_purchase_order() mirrors delete_shipping_ticket() (see migration
-- 20260801214513): re-checks the same admin/warehouse-manager-and-not-received
-- rule server-side (canDeletePO's rule, also see can_modify_po below),
-- reverses every packing-slip-sourced ledger row tied to the PO's slips via
-- compensating rows (append-only ledger, never touching the original rows),
-- then deletes slip items -> slips -> PO items -> PO in that order so the
-- FK restrict on packing_slips.po_id never fires.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_purchase_order(_po_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po public.purchase_orders;
  _actor UUID := auth.uid();
BEGIN
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF NOT (
    public.is_admin(_actor)
    OR (public.is_warehouse_or_admin(_actor) AND _po.status <> 'received')
  ) THEN
    RAISE EXCEPTION 'Not permitted to delete this purchase order';
  END IF;

  -- Reverse packing-slip-derived inventory for every slip on this PO.
  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  SELECT
    ps.project_id,
    ia.product_id,
    -SUM(ia.delta),
    'packing_slip',
    ia.source_id,
    'Reversed: PO ' || _po.po_number || ' deleted, slip ' || ps.slip_number || ' inventory undone',
    _actor
  FROM public.inventory_adjustments ia
  JOIN public.packing_slips ps ON ps.id = ia.source_id
  WHERE ia.source_type = 'packing_slip' AND ps.po_id = _po_id
  GROUP BY ps.project_id, ia.product_id, ia.source_id, ps.slip_number
  HAVING SUM(ia.delta) <> 0;

  DELETE FROM public.packing_slip_items
  WHERE slip_id IN (SELECT id FROM public.packing_slips WHERE po_id = _po_id);

  DELETE FROM public.packing_slips WHERE po_id = _po_id;

  DELETE FROM public.purchase_order_items WHERE po_id = _po_id;

  DELETE FROM public.purchase_orders WHERE id = _po_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_purchase_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_purchase_order(UUID) TO authenticated;

COMMIT;
