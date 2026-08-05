
-- ============ FIX F-17: PO STATUS TRANSITIONS WERE UNGUARDED ============
-- The status dropdown (purchase-orders.$id.tsx) offered all five statuses,
-- including partially_received/received -- values that are supposed to be
-- computed automatically from actual receiving activity by
-- refreshPoStatus() (src/lib/receiving.ts), which already runs after every
-- packing-slip save. Nothing stopped a manual jump straight to "Received"
-- with zero slips against the PO, or moving a genuinely-received PO back to
-- "Draft" -- which did nothing durable, since the next slip edit silently
-- recomputed it back to Received/Partially Received with no warning.
--
-- enforce_po_status_transition() makes the real data the authority: whether
-- a status change is allowed depends on whether the PO actually has any
-- recorded receipts (packing_slip_items.qty_received > 0), not on who's
-- asking. refreshPoStatus() always computes status from that exact same
-- condition, so it never conflicts with this trigger -- only a manual or
-- otherwise-incorrect attempt (the dropdown, or a raw API call) can ever be
-- rejected. The correct way to move a received PO back is no longer "flip
-- the dropdown" (which never actually worked) but "correct the packing
-- slip" -- delete or edit it (see F-16), which reverses inventory and lets
-- refreshPoStatus revert the PO's status properly, including back to
-- whatever it was before receiving started (see F-11).
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_po_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_receipts BOOLEAN;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.packing_slip_items psi
      JOIN public.packing_slips ps ON ps.id = psi.slip_id
      WHERE ps.po_id = NEW.id AND psi.qty_received > 0
    ) INTO _has_receipts;

    IF _has_receipts AND NEW.status NOT IN ('partially_received', 'received') THEN
      RAISE EXCEPTION 'This PO has recorded receipts and must stay Partially Received or Received. To correct it, edit or delete the packing slip instead.';
    END IF;

    IF NOT _has_receipts AND NEW.status IN ('partially_received', 'received') THEN
      RAISE EXCEPTION 'This PO has no recorded receipts yet -- Partially Received/Received are set automatically when a packing slip is saved.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_status_transition ON public.purchase_orders;
CREATE TRIGGER trg_po_status_transition BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_po_status_transition();

COMMIT;
