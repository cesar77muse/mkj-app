
-- ============ FIX F-02: BORROW APPROVAL ATOMICITY ============
-- decide() previously updated borrow_requests.status first, then inserted
-- two inventory_adjustments rows (source project, target project) in a
-- second round trip. inv_insert requires can_write_project for each row's
-- own project_id — a source-project manager who doesn't also manage the
-- target project fails on the second row, but the status update has
-- already committed. Result: "approved" with no stock movement, no
-- rollback (there was no transaction to roll back).
--
-- decide_borrow_request() does the on-hand check, the status update, both
-- ledger rows, and the fulfilled flip inside one plpgsql function — one
-- transaction, one permission check (mirrors br_update: caller must be able
-- to write the source project), so it's all-or-nothing.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.decide_borrow_request(
  _request_id UUID,
  _status TEXT,
  _qty_approved NUMERIC,
  _note TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.borrow_requests;
  _actor UUID := auth.uid();
  _q NUMERIC;
  _available NUMERIC;
  _src_mkj TEXT;
  _tgt_mkj TEXT;
BEGIN
  IF _status NOT IN ('approved', 'denied', 'partially_approved') THEN
    RAISE EXCEPTION 'Invalid decision status: %', _status;
  END IF;

  SELECT * INTO _req FROM public.borrow_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrow request not found';
  END IF;

  IF NOT public.can_write_project(_actor, _req.source_project_id) THEN
    RAISE EXCEPTION 'Not permitted to decide this request';
  END IF;

  IF _status <> 'denied' THEN
    _q := COALESCE(_qty_approved, _req.qty_requested);
    SELECT COALESCE(on_hand, 0) INTO _available
    FROM public.v_project_inventory
    WHERE project_id = _req.source_project_id AND product_id = _req.product_id;
    IF _q > COALESCE(_available, 0) THEN
      RAISE EXCEPTION 'Only % on hand. Approve % or less.', COALESCE(_available, 0), COALESCE(_available, 0);
    END IF;
  END IF;

  UPDATE public.borrow_requests SET
    status = _status::public.borrow_status,
    qty_approved = CASE WHEN _status = 'denied' THEN NULL ELSE _qty_approved END,
    decision_note = NULLIF(_note, ''),
    decided_by = _actor,
    decided_at = now()
  WHERE id = _request_id;

  IF _status <> 'denied' THEN
    SELECT mkj_number INTO _src_mkj FROM public.projects WHERE id = _req.source_project_id;
    SELECT mkj_number INTO _tgt_mkj FROM public.projects WHERE id = _req.target_project_id;

    INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
    VALUES
      (_req.source_project_id, _req.product_id, -_q, 'borrow_out', _request_id, 'Borrow to ' || COALESCE(_tgt_mkj, ''), _actor),
      (_req.target_project_id, _req.product_id, _q, 'borrow_in', _request_id, 'Borrow from ' || COALESCE(_src_mkj, ''), _actor);

    UPDATE public.borrow_requests SET status = 'fulfilled', fulfilled_at = now() WHERE id = _request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

COMMIT;
