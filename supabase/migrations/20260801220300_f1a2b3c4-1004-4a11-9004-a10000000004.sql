
-- ============ FIX F-05: PO / PACKING-SLIP EDIT-DELETE RULES WERE COSMETIC ============
-- canEditPO/canDeletePO (client) and the packing-slip edit dialog's
-- isWarehouseOrAdmin check only ever decided whether to render a button.
-- The actual RLS (po_write/poi_write/ps_write/psi_write, all
-- FOR ALL USING (can_write_project(...))) let any project manager on the
-- project update or delete a PO/slip directly via the API, including a
-- received PO, bypassing those UI-only rules entirely.
--
-- purchase_orders needs care: its UPDATE permission is also legitimately
-- used, for ANY project manager, by (a) the status dropdown on the PO
-- detail page and (b) refreshPoStatus()'s automatic status/pre_receipt_status
-- recompute on every packing-slip save. Tightening the RLS UPDATE policy
-- itself would break both. So: the RLS INSERT/UPDATE policy for
-- purchase_orders is left as can_write_project (unchanged behavior); a
-- BEFORE UPDATE trigger separately blocks changes to the *edit-dialog*
-- fields (supplier/assignee/dates/terms/freight/bill-ship-to) unless the
-- actor satisfies can_modify_po (admin, or warehouse-manager while not yet
-- received) -- the exact canEditPO rule enforced at the DB layer instead of
-- only in the button. DELETE has no such competing use, so it's split into
-- its own can_modify_po-gated policy directly.
--
-- purchase_order_items / packing_slips / packing_slip_items: confirmed (by
-- grep across src/) that UPDATE/DELETE on these tables only ever happens
-- from the already-gated edit dialogs, so those can be tightened directly
-- via RLS with no other caller to break.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

-- ---- can_modify_po: the canEditPO/canDeletePO rule, in SQL ----
CREATE OR REPLACE FUNCTION public.can_modify_po(_user_id UUID, _status public.po_status)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
    OR (public.is_warehouse_or_admin(_user_id) AND _status <> 'received')
$$;

-- ---- purchase_orders: keep insert/update as-is, split out a tighter delete ----
DROP POLICY IF EXISTS po_write ON public.purchase_orders;
CREATE POLICY po_insert ON public.purchase_orders FOR INSERT TO authenticated
WITH CHECK (public.can_write_project(auth.uid(), project_id));
CREATE POLICY po_update ON public.purchase_orders FOR UPDATE TO authenticated
USING (public.can_write_project(auth.uid(), project_id))
WITH CHECK (public.can_write_project(auth.uid(), project_id));
CREATE POLICY po_delete ON public.purchase_orders FOR DELETE TO authenticated
USING (public.can_modify_po(auth.uid(), status));

-- ---- Column-level guard for purchase_orders UPDATE: only the fields the
-- edit dialog exposes are restricted; status/pre_receipt_status stay open
-- to any project write-user (status dropdown + receiving's auto-recompute).
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_edit_guard ON public.purchase_orders;
CREATE TRIGGER trg_po_edit_guard BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_po_edit_guard();

-- ---- purchase_order_items: insert stays open (creation flow), update/delete gated ----
DROP POLICY IF EXISTS poi_write ON public.purchase_order_items;
CREATE POLICY poi_insert ON public.purchase_order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_write_project(auth.uid(), p.project_id)));
CREATE POLICY poi_update ON public.purchase_order_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_modify_po(auth.uid(), p.status)))
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_modify_po(auth.uid(), p.status)));
CREATE POLICY poi_delete ON public.purchase_order_items FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_modify_po(auth.uid(), p.status)));

-- ---- packing_slips: insert stays open (receiving flow), update gated to warehouse/admin ----
DROP POLICY IF EXISTS ps_write ON public.packing_slips;
CREATE POLICY ps_insert ON public.packing_slips FOR INSERT TO authenticated
WITH CHECK (public.can_write_project(auth.uid(), project_id));
CREATE POLICY ps_update ON public.packing_slips FOR UPDATE TO authenticated
USING (public.is_warehouse_or_admin(auth.uid())) WITH CHECK (public.is_warehouse_or_admin(auth.uid()));

-- ---- packing_slip_items: same split ----
DROP POLICY IF EXISTS psi_write ON public.packing_slip_items;
CREATE POLICY psi_insert ON public.packing_slip_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.packing_slips s WHERE s.id = slip_id AND public.can_write_project(auth.uid(), s.project_id)));
CREATE POLICY psi_update ON public.packing_slip_items FOR UPDATE TO authenticated
USING (public.is_warehouse_or_admin(auth.uid())) WITH CHECK (public.is_warehouse_or_admin(auth.uid()));

-- ---- create_purchase_order: add _assignee so purchase-orders.new.tsx no
-- longer needs a follow-up direct UPDATE (which the new edit guard above
-- would otherwise block for the plain project manager who just created it).
-- Adding a parameter makes this a *different* signature as far as Postgres
-- is concerned, so CREATE OR REPLACE alone would leave the old 8-arg
-- function in place as an ambiguous overload -- drop it explicitly first.
DROP FUNCTION IF EXISTS public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  _project_id UUID,
  _supplier_id UUID,
  _bill_to TEXT,
  _ship_to TEXT,
  _delivery_date DATE,
  _ship_via TEXT,
  _payment_terms TEXT,
  _description TEXT,
  _assignee UUID DEFAULT NULL
) RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_number TEXT;
  _next_seq INTEGER;
  _po_number TEXT;
  _new_po public.purchase_orders;
BEGIN
  IF NOT public.can_write_project(auth.uid(), _project_id) THEN
    RAISE EXCEPTION 'Not permitted to create a purchase order for this project';
  END IF;

  SELECT mkj_number INTO _project_number
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT COALESCE(MAX(po_sequence), 0) + 1 INTO _next_seq
  FROM public.purchase_orders
  WHERE project_id = _project_id;

  _po_number := 'MKJ' || _project_number || 'EX' || LPAD(_next_seq::TEXT, 3, '0');

  INSERT INTO public.purchase_orders (
    project_id, project_number, po_sequence, po_number,
    supplier_id, bill_to, ship_to, delivery_date, ship_via, payment_terms, description, assignee, created_by
  ) VALUES (
    _project_id, _project_number, _next_seq, _po_number,
    _supplier_id, _bill_to, _ship_to, _delivery_date, _ship_via, _payment_terms, _description, _assignee, auth.uid()
  )
  RETURNING * INTO _new_po;

  RETURN _new_po;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
