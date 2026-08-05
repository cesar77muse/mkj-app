
-- ============ FIX F-14: FREIGHT / TERMS & CONDITIONS CAN'T BE ENTERED ============
-- purchase_orders.additional_freight and .terms_conditions already exist,
-- are already printed on the PO PDF, and additional_freight is already
-- included in the detail-page total -- but create_purchase_order() had no
-- parameters for either, so there was never a way to set them at creation
-- time (the edit dialog's save path is a separate, direct client update and
-- didn't need an RPC change -- see the matching frontend commit).
--
-- Adding parameters changes the function's signature as far as Postgres is
-- concerned, so the old 9-arg version (project/supplier/bill_to/ship_to/
-- delivery_date/ship_via/payment_terms/description/assignee, added for
-- F-05) is dropped first to avoid leaving an ambiguous overload, same as
-- when _assignee was added.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

DROP FUNCTION IF EXISTS public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  _project_id UUID,
  _supplier_id UUID,
  _bill_to TEXT,
  _ship_to TEXT,
  _delivery_date DATE,
  _ship_via TEXT,
  _payment_terms TEXT,
  _description TEXT,
  _assignee UUID DEFAULT NULL,
  _additional_freight NUMERIC DEFAULT 0,
  _terms_conditions TEXT DEFAULT NULL
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
    supplier_id, bill_to, ship_to, delivery_date, ship_via, payment_terms, description, assignee,
    additional_freight, terms_conditions, created_by
  ) VALUES (
    _project_id, _project_number, _next_seq, _po_number,
    _supplier_id, _bill_to, _ship_to, _delivery_date, _ship_via, _payment_terms, _description, _assignee,
    COALESCE(_additional_freight, 0), _terms_conditions, auth.uid()
  )
  RETURNING * INTO _new_po;

  RETURN _new_po;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT) TO authenticated;

COMMIT;
