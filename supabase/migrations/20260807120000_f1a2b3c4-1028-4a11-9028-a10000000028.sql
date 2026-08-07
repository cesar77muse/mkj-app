
-- ============ FEATURE: TRACK "ENTERED IN PROCORE" ON PURCHASE ORDERS ============
-- Adds entered_in_procore (boolean, default false) to purchase_orders so
-- warehouse managers can track whether a PO has been manually re-entered
-- into Procore. Tracking only -- it never blocks any existing action and is
-- toggleable in both directions, even on a received PO (in case it was
-- ticked by mistake).
--
-- Permissions: po_update (RLS) stays can_write_project, unchanged -- that
-- policy is shared with the status dropdown and refreshPoStatus()'s
-- automatic recompute, same reasoning as F-05 (see the 1004 migration).
-- Restricting *this* column to admin/warehouse-manager only is instead done
-- in enforce_po_edit_guard, the same BEFORE UPDATE trigger F-05 introduced
-- for the other edit-dialog-only fields. That fix exists precisely because
-- a client-side-only check (isWarehouseOrAdmin gating the checkbox) doesn't
-- stop a plain project manager from flipping the column directly via the
-- API -- see F-05's commit message. entered_in_procore deliberately does
-- NOT go through can_modify_po (which excludes warehouse managers once a
-- PO is 'received'): the spec calls for this toggle to keep working after
-- receipt, so it's gated on is_warehouse_or_admin alone, with no status
-- condition.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS entered_in_procore BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_po_edit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.assignee IS DISTINCT FROM OLD.assignee
      OR NEW.bill_to IS DISTINCT FROM OLD.bill_to
      OR NEW.ship_to IS DISTINCT FROM OLD.ship_to
      OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
      OR NEW.ship_via IS DISTINCT FROM OLD.ship_via
      OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.terms_conditions IS DISTINCT FROM OLD.terms_conditions
      OR NEW.additional_freight IS DISTINCT FROM OLD.additional_freight)
     AND NOT public.can_modify_po(auth.uid(), OLD.status)
  THEN
    RAISE EXCEPTION 'Not permitted to edit this purchase order';
  END IF;

  IF NEW.entered_in_procore IS DISTINCT FROM OLD.entered_in_procore
     AND NOT public.is_warehouse_or_admin(auth.uid())
  THEN
    RAISE EXCEPTION 'Not permitted to change Procore entry status';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
