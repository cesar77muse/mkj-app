
-- ============ FIX F-12: BORROW RETURNS ============
-- borrow_status already had an unused 'returned' value, and ledger_source
-- already had unused 'borrow_return_out'/'borrow_return_in' values -- the
-- vocabulary existed but nothing in the app ever used it. A lending
-- project had no way to get borrowed stock back except a manual
-- counter-borrow in the opposite direction.
--
-- Built to match the frontend already shipped in borrow-requests.tsx
-- ("Added partial returns"), which supports RETURNING PART OF an approved
-- quantity over one or more separate actions (not a single all-or-nothing
-- action) -- so this tracks a running total (qty_returned) rather than a
-- one-shot flip, mirroring how qty_approved already works.
--
-- 'partially_returned' is a new status, sitting alongside the existing
-- 'partially_approved' for the same reason: 0 < qty_returned < qty_approved.
-- Status becomes 'returned' once qty_returned reaches qty_approved.
--
-- ALTER TYPE ... ADD VALUE cannot safely be used in the same transaction
-- that might reference the new value, so it runs standalone before the
-- BEGIN/COMMIT block below (the function created inside that block only
-- references the value in its body text -- resolved when the function is
-- later *called*, not when it's defined -- but the column DEFAULT and any
-- data write must never share a transaction with the ADD VALUE itself).
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

ALTER TYPE public.borrow_status ADD VALUE IF NOT EXISTS 'partially_returned';

BEGIN;

-- ---- borrow_requests: return-tracking columns, mirroring decided_by/decided_at ----
ALTER TABLE public.borrow_requests ADD COLUMN IF NOT EXISTS qty_returned NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.borrow_requests ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES auth.users(id);
ALTER TABLE public.borrow_requests ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE public.borrow_requests ADD COLUMN IF NOT EXISTS return_note TEXT;

-- ---- return_borrowed_stock: the RPC the frontend already calls ----
-- Mirrors decide_borrow_request()'s shape: one permission check, one
-- on-hand check, atomic ledger + status update. Caller must be able to
-- write the *target* (borrowing) project -- the mirror image of
-- decide_borrow_request, which requires write access to the *source*
-- (lending) project.
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
    status = CASE WHEN _new_returned >= COALESCE(_req.qty_approved, 0) THEN 'returned' ELSE 'partially_returned' END
  WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT) TO authenticated;

-- ---- notify_borrow_request: add the missing branch for returns ----
CREATE OR REPLACE FUNCTION public.notify_borrow_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src TEXT;
  _tgt TEXT;
  _part TEXT;
  _link TEXT;
  _actor UUID := auth.uid();
  _title TEXT;
  _body TEXT;
  _type TEXT;
BEGIN
  SELECT mkj_number INTO _src FROM public.projects WHERE id = NEW.source_project_id;
  SELECT mkj_number INTO _tgt FROM public.projects WHERE id = NEW.target_project_id;
  SELECT part_number INTO _part FROM public.products WHERE id = NEW.product_id;
  _link := '/borrow-requests?request=' || NEW.id::TEXT;

  IF TG_OP = 'INSERT' THEN
    -- Requester confirmation
    IF NEW.requested_by IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      VALUES (NEW.requested_by, 'borrow_created',
        'Borrow request sent to ' || _src,
        'You requested ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' from ' || _src || ' for ' || _tgt || '.',
        _link);
    END IF;

    -- Lending side: project managers + oversight roles
    INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
    SELECT u, 'borrow_requested',
      'Borrow request from ' || _tgt,
      _tgt || ' is requesting ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' from ' || _src || '. Review to approve or deny.',
      _link
    FROM public.borrow_notify_recipients(NEW.source_project_id) u
    WHERE u IS DISTINCT FROM NEW.requested_by;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      SELECT u, 'borrow_cancelled',
        'Borrow request withdrawn',
        _tgt || ' withdrew its request for ' || _part || ' from ' || _src || '.',
        _link
      FROM public.borrow_notify_recipients(NEW.source_project_id) u
      WHERE u IS DISTINCT FROM _actor;
      RETURN NEW;
    END IF;

    IF NEW.status IN ('approved', 'partially_approved', 'denied') THEN
      IF NEW.status = 'denied' THEN
        _type := 'borrow_denied';
        _title := 'Borrow request denied by ' || _src;
        _body := _src || ' denied the request for ' || _part || '.';
      ELSE
        _type := 'borrow_approved';
        _title := CASE WHEN NEW.status = 'partially_approved'
          THEN 'Borrow request partially approved by ' || _src
          ELSE 'Borrow request approved by ' || _src END;
        _body := _src || ' approved ' || trim(to_char(COALESCE(NEW.qty_approved, NEW.qty_requested), 'FM999999999'))
          || ' of ' || trim(to_char(NEW.qty_requested, 'FM999999999')) || ' x ' || _part || ' for ' || _tgt || '.';
      END IF;

      IF NEW.decision_note IS NOT NULL AND NEW.decision_note <> '' THEN
        _body := _body || ' Note: ' || NEW.decision_note;
      END IF;

      -- Requester + everyone on both sides who should know
      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      SELECT DISTINCT u, _type, _title, _body, _link
      FROM (
        SELECT NEW.requested_by AS u
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.target_project_id)
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.source_project_id)
      ) r
      WHERE u IS NOT NULL AND u IS DISTINCT FROM _actor;
    END IF;

    IF NEW.status IN ('partially_returned', 'returned') THEN
      IF NEW.status = 'returned' THEN
        _type := 'borrow_returned';
        _title := 'Borrow fully returned to ' || _src;
        _body := _tgt || ' returned the remaining ' || trim(to_char(NEW.qty_returned - COALESCE(OLD.qty_returned, 0), 'FM999999999'))
          || ' x ' || _part || ' to ' || _src || '. Request closed.';
      ELSE
        _type := 'borrow_partially_returned';
        _title := 'Partial return from ' || _tgt;
        _body := _tgt || ' returned ' || trim(to_char(NEW.qty_returned - COALESCE(OLD.qty_returned, 0), 'FM999999999'))
          || ' x ' || _part || ' to ' || _src || '. '
          || trim(to_char(COALESCE(NEW.qty_approved, 0) - NEW.qty_returned, 'FM999999999')) || ' still outstanding.';
      END IF;

      IF NEW.return_note IS NOT NULL AND NEW.return_note <> '' THEN
        _body := _body || ' Note: ' || NEW.return_note;
      END IF;

      INSERT INTO public.notifications (recipient_user_id, type, title, body, link)
      SELECT DISTINCT u, _type, _title, _body, _link
      FROM (
        SELECT NEW.requested_by AS u
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.target_project_id)
        UNION SELECT * FROM public.borrow_notify_recipients(NEW.source_project_id)
      ) r
      WHERE u IS NOT NULL AND u IS DISTINCT FROM _actor;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_borrow_notify ON public.borrow_requests;
CREATE TRIGGER trg_borrow_notify
AFTER INSERT OR UPDATE ON public.borrow_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_borrow_request();

COMMIT;
