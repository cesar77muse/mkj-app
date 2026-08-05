
-- ============ FIX F-23: SLIP LINES NEVER RE-SYNCED qty_ordered ============
-- packing_slip_items.qty_ordered is snapshotted from the PO line's qty at
-- the moment a slip is created, then never touched again. If the PO line's
-- quantity is edited afterward (po-edit-dialog.tsx), every slip already
-- recorded against it keeps the stale value -- slipStatusFor() and the
-- displayed backorder both compute against a number that no longer matches
-- what's actually ordered.
--
-- A trigger on purchase_order_items propagates a qty change to every
-- packing_slip_item snapshotted from it (matched via po_item_id). This
-- doesn't touch qty_received (what was actually received stays exactly as
-- recorded) -- only qty_ordered, so backorder/status recompute correctly
-- against the current order.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_packing_slip_item_qty_ordered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qty IS DISTINCT FROM OLD.qty THEN
    UPDATE public.packing_slip_items
    SET qty_ordered = NEW.qty
    WHERE po_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poi_sync_slip_qty ON public.purchase_order_items;
CREATE TRIGGER trg_poi_sync_slip_qty
AFTER UPDATE OF qty ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_packing_slip_item_qty_ordered();

COMMIT;
