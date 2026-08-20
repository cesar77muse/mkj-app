-- ============ SERIAL NUMBER TRACKING: BORROWING ============
-- Borrowing moves quantity between projects (decide_borrow_request writes
-- borrow_out/borrow_in, return_borrowed_stock writes the reverse pair).
-- Serials had no equivalent, so a borrowed unit stayed listed under the
-- LENDING project -- the quantity said the part had moved, the serial said
-- it hadn't. For sensitive parts, "which project physically holds this
-- unit" is the whole question the feature exists to answer.
--
-- This file:
--   1. borrow_request_serials -- which specific units went out on a
--      request, and which of them have come back.
--   2. v_project_serials, replaced: a unit that is out on an unreturned
--      borrow is located at the BORROWING project.
--   3. decide_borrow_request / return_borrowed_stock, each taking an
--      optional _serials array.
--
-- Both RPCs gain a parameter, so they are dropped and recreated rather
-- than CREATE OR REPLACE'd (Postgres treats a changed argument list as a
-- different function). The existing frontend calls them with NAMED
-- arguments and no _serials, which PostgREST resolves against the new
-- signature using the DEFAULT -- so nothing breaks if the frontend deploy
-- and this migration land out of order.
--
-- PARTIAL RETURNS: a request can be returned across several actions
-- (qty_returned tracks the running total), so returns are recorded per
-- unit -- each serial row is stamped returned_at when that specific unit
-- comes home, rather than flipping the whole request at once.
--
-- CHAINED BORROWS (A lends to B, B lends the same unit on to C) are
-- deliberately not blocked by a constraint: the view resolves a unit's
-- location from its most recent outstanding borrow, so the chain unwinds
-- correctly as each leg is returned. What IS blocked -- in the RPC, with a
-- readable message -- is lending a unit that isn't currently at the
-- lending project.
--
-- Naming serials stays OPTIONAL, consistent with receiving and shipping:
-- an approver can transfer 5 units and name 3 of them. Quantity is the
-- system of record for stock levels; serials are traceability on top.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

-- ---------------------------------------------------------------
-- 1. WHICH UNITS WENT OUT ON A BORROW
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.borrow_request_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  serial TEXT NOT NULL CHECK (btrim(serial) <> ''),
  lent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lent_by UUID REFERENCES auth.users(id),
  returned_at TIMESTAMPTZ,
  returned_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_brs_request ON public.borrow_request_serials (request_id);
CREATE INDEX IF NOT EXISTS idx_brs_lookup  ON public.borrow_request_serials (product_id, returned_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_brs_request_serial
  ON public.borrow_request_serials (request_id, upper(serial));

-- Read-only to authenticated: rows are written exclusively by the two
-- SECURITY DEFINER RPCs below, which own the validation. Visibility
-- matches br_select -- either side of the transfer can see it.
GRANT SELECT ON public.borrow_request_serials TO authenticated;
GRANT ALL ON public.borrow_request_serials TO service_role;
ALTER TABLE public.borrow_request_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brs_select" ON public.borrow_request_serials;
CREATE POLICY "brs_select" ON public.borrow_request_serials FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.borrow_requests b
  WHERE b.id = request_id
    AND (public.can_see_project(auth.uid(), b.source_project_id)
      OR public.can_see_project(auth.uid(), b.target_project_id))
));

-- ---------------------------------------------------------------
-- 2. v_project_serials, now borrow-aware
-- ---------------------------------------------------------------
-- home  = the project whose packing slip received the unit.
-- lent  = most recent borrow leg still outstanding for that unit, which
--         wins over home (and over an earlier leg, so chains resolve).
-- Same has_any_role() guard as v_project_inventory.
-- Dropped rather than replaced: CREATE OR REPLACE VIEW refuses any change
-- to the column list, and this is re-runnable by design.
DROP VIEW IF EXISTS public.v_project_serials;

CREATE VIEW public.v_project_serials AS
WITH received AS (
  SELECT s.project_id AS home_project_id, r.product_id, r.serial
  FROM public.packing_slip_item_serials r
  JOIN public.packing_slip_items i ON i.id = r.slip_item_id
  JOIN public.packing_slips s ON s.id = i.slip_id
  WHERE r.product_id IS NOT NULL AND i.condition = 'ok'
),
lent AS (
  SELECT DISTINCT ON (b.product_id, upper(b.serial))
    b.product_id,
    upper(b.serial) AS serial_key,
    br.target_project_id
  FROM public.borrow_request_serials b
  JOIN public.borrow_requests br ON br.id = b.request_id
  WHERE b.returned_at IS NULL
    AND br.status IN ('fulfilled', 'partially_returned')
  ORDER BY b.product_id, upper(b.serial), b.lent_at DESC
)
SELECT
  COALESCE(l.target_project_id, rc.home_project_id) AS project_id,
  rc.product_id,
  rc.serial,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.shipping_ticket_item_serials ts
    JOIN public.shipping_ticket_items ti ON ti.id = ts.ticket_item_id
    JOIN public.shipping_tickets t ON t.id = ti.ticket_id
    WHERE ts.product_id = rc.product_id
      AND upper(ts.serial) = upper(rc.serial)
      AND t.status IN ('shipped', 'delivered')
  ) THEN 'shipped' ELSE 'in_stock' END AS status
FROM received rc
LEFT JOIN lent l ON l.product_id = rc.product_id AND l.serial_key = upper(rc.serial)
WHERE public.has_any_role(auth.uid());

GRANT SELECT ON public.v_project_serials TO authenticated;

-- ---------------------------------------------------------------
-- 3a. decide_borrow_request(..., _serials)
-- ---------------------------------------------------------------
-- Body is unchanged from 20260801222000 (F-27) except for the serial
-- block at the end -- same permission check, same qty_requested bound,
-- same on-hand bound, same ledger pair, same fulfilled flip.
DROP FUNCTION IF EXISTS public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT, TEXT[]);

CREATE FUNCTION public.decide_borrow_request(
  _request_id UUID,
  _status TEXT,
  _qty_approved NUMERIC,
  _note TEXT,
  _serials TEXT[] DEFAULT NULL
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
  _clean TEXT[];
  _s TEXT;
  _located UUID;
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

    -- Trim, drop blanks, de-duplicate. Naming fewer serials than the
    -- approved quantity is allowed on purpose; naming more is not, since
    -- that would claim more units moved than the ledger records.
    SELECT COALESCE(array_agg(DISTINCT btrim(x)), '{}'::TEXT[]) INTO _clean
    FROM unnest(COALESCE(_serials, '{}'::TEXT[])) AS x
    WHERE btrim(x) <> '';

    IF array_length(_clean, 1) > _q THEN
      RAISE EXCEPTION 'Cannot transfer % serial numbers for an approved quantity of %.', array_length(_clean, 1), _q;
    END IF;

    FOREACH _s IN ARRAY _clean LOOP
      SELECT project_id INTO _located
      FROM public.v_project_serials
      WHERE product_id = _req.product_id AND upper(serial) = upper(_s) AND status = 'in_stock'
      LIMIT 1;

      IF _located IS NULL THEN
        RAISE EXCEPTION 'Serial "%" is not on hand for this part — it may already be shipped out or was never received.', _s;
      END IF;
      IF _located <> _req.source_project_id THEN
        RAISE EXCEPTION 'Serial "%" is not currently held by the lending project.', _s;
      END IF;
    END LOOP;
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

    IF array_length(_clean, 1) > 0 THEN
      INSERT INTO public.borrow_request_serials (request_id, product_id, serial, lent_by)
      SELECT _request_id, _req.product_id, s, _actor FROM unnest(_clean) AS s;
    END IF;

    UPDATE public.borrow_requests SET status = 'fulfilled', fulfilled_at = now() WHERE id = _request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_borrow_request(UUID, TEXT, NUMERIC, TEXT, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------
-- 3b. return_borrowed_stock(..., _serials)
-- ---------------------------------------------------------------
-- Body is unchanged from 20260801221100 except for the serial block.
DROP FUNCTION IF EXISTS public.return_borrowed_stock(UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.return_borrowed_stock(UUID, NUMERIC, TEXT, TEXT[]);

CREATE FUNCTION public.return_borrowed_stock(
  _request_id UUID,
  _qty NUMERIC,
  _note TEXT DEFAULT NULL,
  _serials TEXT[] DEFAULT NULL
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
  _clean TEXT[];
  _s TEXT;
  _hit UUID;
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

  -- Serials, when named, must be units this request actually sent out and
  -- that haven't already come back. Returning 3 units while naming 2 of
  -- them is allowed; naming more serials than units is not.
  SELECT COALESCE(array_agg(DISTINCT btrim(x)), '{}'::TEXT[]) INTO _clean
  FROM unnest(COALESCE(_serials, '{}'::TEXT[])) AS x
  WHERE btrim(x) <> '';

  IF array_length(_clean, 1) > _qty THEN
    RAISE EXCEPTION 'Cannot return % serial numbers against a quantity of %.', array_length(_clean, 1), _qty;
  END IF;

  FOREACH _s IN ARRAY _clean LOOP
    SELECT id INTO _hit
    FROM public.borrow_request_serials
    WHERE request_id = _request_id AND upper(serial) = upper(_s) AND returned_at IS NULL
    LIMIT 1;

    IF _hit IS NULL THEN
      RAISE EXCEPTION 'Serial "%" is not outstanding on this borrow request.', _s;
    END IF;
  END LOOP;

  SELECT mkj_number INTO _src_mkj FROM public.projects WHERE id = _req.source_project_id;
  SELECT mkj_number INTO _tgt_mkj FROM public.projects WHERE id = _req.target_project_id;

  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  VALUES
    (_req.target_project_id, _req.product_id, -_qty, 'borrow_return_out', _request_id, 'Returned to ' || COALESCE(_src_mkj, ''), _actor),
    (_req.source_project_id, _req.product_id, _qty, 'borrow_return_in', _request_id, 'Returned from ' || COALESCE(_tgt_mkj, ''), _actor);

  IF array_length(_clean, 1) > 0 THEN
    UPDATE public.borrow_request_serials
    SET returned_at = now(), returned_by = _actor
    WHERE request_id = _request_id
      AND returned_at IS NULL
      AND upper(serial) IN (SELECT upper(x) FROM unnest(_clean) AS x);
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_borrowed_stock(UUID, NUMERIC, TEXT, TEXT[]) TO authenticated;

COMMIT;

-- PostgREST caches function signatures; both RPCs changed shape. Supabase
-- reloads on DDL automatically, but if a call 404s right after running
-- this, that reload is why -- NOTIFY pgrst, 'reload schema'; forces it.
