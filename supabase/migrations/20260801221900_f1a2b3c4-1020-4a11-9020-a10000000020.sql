
-- ============ FIX F-26: ORPHAN SUPPLIER ROWS FROM "OTHER..." ============
-- purchase-orders.new.tsx inserted the new supplier in its own round trip
-- before calling create_purchase_order(). If PO creation then failed
-- (validation, RLS, network), the supplier row was already committed and
-- stayed orphaned -- and retrying re-ran the same insert, creating a
-- duplicate (suppliers.name has no uniqueness constraint).
--
-- Folds supplier creation into the same atomic call: create_purchase_order
-- gains an optional _new_supplier_name, and creates that supplier inside
-- the same transaction as the PO insert -- if anything downstream fails,
-- the whole call rolls back, supplier included. Same overload-avoidance
-- pattern as every previous parameter addition to this function (drop the
-- old signature first).
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

DROP FUNCTION IF EXISTS public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT);

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
  _terms_conditions TEXT DEFAULT NULL,
  _new_supplier_name TEXT DEFAULT NULL
) RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_number TEXT;
  _next_seq INTEGER;
  _po_number TEXT;
  _resolved_supplier_id UUID;
  _new_po public.purchase_orders;
BEGIN
  IF NOT public.can_write_project(auth.uid(), _project_id) THEN
    RAISE EXCEPTION 'Not permitted to create a purchase order for this project';
  END IF;

  _resolved_supplier_id := _supplier_id;
  IF _new_supplier_name IS NOT NULL AND trim(_new_supplier_name) <> '' THEN
    INSERT INTO public.suppliers (name) VALUES (trim(_new_supplier_name))
    RETURNING id INTO _resolved_supplier_id;
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
    _resolved_supplier_id, _bill_to, _ship_to, _delivery_date, _ship_via, _payment_terms, _description, _assignee,
    COALESCE(_additional_freight, 0), _terms_conditions, auth.uid()
  )
  RETURNING * INTO _new_po;

  RETURN _new_po;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

COMMIT;
