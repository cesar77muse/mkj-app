
-- ============ FIX F-27: APPROVED QUANTITY NEVER BOUNDED BY THE REQUEST ============
-- The approve dialog let an approver type any quantity, only checked
-- against on-hand -- never against qty_requested. Approving more than was
-- ever asked for still got labeled "approved" (not "partially_approved",
-- since that label only triggered when the approved amount was *less*
-- than requested). Fixed client-side (input clamped to qty_requested), and
-- here server-side for the same defense-in-depth every other guard this
-- session has -- the RPC is the real authority regardless of what the
-- dialog allows.
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

  IF _req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided (%).', _req.status;
  END IF;

  IF _status <> 'denied' THEN
    _q := COALESCE(_qty_approved, _req.qty_requested);

    IF _q > _req.qty_requested THEN
      RAISE EXCEPTION 'Cannot approve % — only % was requested.', _q, _req.qty_requested;
    END IF;

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
