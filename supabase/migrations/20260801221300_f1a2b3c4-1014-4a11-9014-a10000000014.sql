
-- ============ FIX F-16: NO PACKING-SLIP DELETE / SAFE CORRECTION PATH ============
-- A slip recorded against the wrong PO or project had no way to be removed
-- by anyone -- the edit dialog can correct quantities (and, since F-01,
-- does so safely), but there was no delete path: no UI button, and no
-- DELETE policy on packing_slips (deliberately, from the F-05 hardening --
-- only INSERT/UPDATE are granted).
--
-- delete_packing_slip() mirrors delete_purchase_order()/delete_shipping_ticket():
-- checks the same warehouse/admin rule the edit dialog already enforces
-- (packing slips have no "nothing's happened yet" phase like POs/tickets do
-- -- a slip represents a real receiving event from the moment it exists, so
-- there's no status-based carve-out here), reverses any packing-slip-sourced
-- inventory for this slip via compensating rows (append-only ledger, same
-- pattern as everywhere else), then removes the slip's items and the slip
-- itself atomically.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_packing_slip(_slip_id UUID)
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

  IF NOT public.is_warehouse_or_admin(_actor) THEN
    RAISE EXCEPTION 'Not permitted to delete this packing slip';
  END IF;

  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  SELECT
    _slip.project_id,
    ia.product_id,
    -SUM(ia.delta),
    'packing_slip',
    _slip_id,
    'Reversed: slip ' || _slip.slip_number || ' deleted',
    _actor
  FROM public.inventory_adjustments ia
  WHERE ia.source_type = 'packing_slip' AND ia.source_id = _slip_id
  GROUP BY ia.product_id
  HAVING SUM(ia.delta) <> 0;

  DELETE FROM public.packing_slip_items WHERE slip_id = _slip_id;
  DELETE FROM public.packing_slips WHERE id = _slip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_packing_slip(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_packing_slip(UUID) TO authenticated;

COMMIT;
