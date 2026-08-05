
-- ============ FIX: return_borrowed_stock ENUM ASSIGNMENT ERROR ============
-- Found by live testing right after F-12 shipped: "column status is of type
-- borrow_status but expression is of type text".
--
-- A bare literal assigned to an enum column (status = 'returned') gets a
-- special "unknown"-type resolution that Postgres matches directly against
-- the target column's type. A CASE expression built from two such literals
-- doesn't get that special treatment -- Postgres resolves the CASE's own
-- result type first (to plain text, since that's the common type of two
-- string literals), and *that* has no implicit assignment cast to a custom
-- enum type. decide_borrow_request() already casts explicitly
-- (_status::public.borrow_status) because its input is a text parameter;
-- this needed the same explicit cast on the CASE result, which was missing.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.return_borrowed_stock(
  _request_id UUID,
  _qty NUMERIC,
  _note TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.borrow_requests;
  _actor UUID := auth.uid();
  _outstanding NUMERIC;
  _on_hand NUMERIC;
  _new_returned NUMERIC;
  _src_mkj TEXT;
  _tgt_mkj TEXT;
BEGIN
  SELECT * INTO _req FROM public.borrow_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrow request not found';
  END IF;

  IF _req.status NOT IN ('fulfilled', 'partially_returned') THEN
    RAISE EXCEPTION 'This request has no outstanding stock to return (%).', _req.status;
  END IF;

  IF NOT public.can_write_project(_actor, _req.target_project_id) THEN
    RAISE EXCEPTION 'Not permitted to return stock for this request';
  END IF;

  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than zero';
  END IF;

  _outstanding := COALESCE(_req.qty_approved, 0) - _req.qty_returned;
  IF _qty > _outstanding THEN
    RAISE EXCEPTION 'Only % still outstanding on this request. Return % or less.', _outstanding, _outstanding;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO _on_hand
  FROM public.inventory_adjustments
  WHERE project_id = _req.target_project_id AND product_id = _req.product_id;
  IF _qty > _on_hand THEN
    RAISE EXCEPTION 'Only % on hand to return. Return % or less.', _on_hand, _on_hand;
  END IF;

  SELECT mkj_number INTO _src_mkj FROM public.projects WHERE id = _req.source_project_id;
  SELECT mkj_number INTO _tgt_mkj FROM public.projects WHERE id = _req.target_project_id;

  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  VALUES
    (_req.target_project_id, _req.product_id, -_qty, 'borrow_return_out', _request_id, 'Returned to ' || COALESCE(_src_mkj, ''), _actor),
    (_req.source_project_id, _req.product_id, _qty, 'borrow_return_in', _request_id, 'Returned from ' || COALESCE(_tgt_mkj, ''), _actor);

  _new_returned := _req.qty_returned + _qty;

  UPDATE public.borrow_requests SET
    qty_returned = _new_returned,
    returned_by = _actor,
    returned_at = now(),
    return_note = NULLIF(_note, ''),
    status = (CASE WHEN _new_returned >= COALESCE(_req.qty_approved, 0) THEN 'returned' ELSE 'partially_returned' END)::public.borrow_status
  WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT) TO authenticated;

COMMIT;
