
-- ============ FIX F-10: NO STOCK CHECK ON THE OUTBOUND (SHIPPING) PATH ============
-- ship_shipping_ticket_inventory() (migration 20260801215648) reconciles a
-- ticket's ledger to "net matches current shipped quantity" unconditionally
-- -- nothing ever checked whether that push would take on-hand negative.
-- The new-ticket screen shows a "short N" hint, but it's informational only
-- (and correctly so -- a ticket can legitimately be created for stock that
-- hasn't arrived yet, that's what qty_backordered is for). The actual gap
-- is at the moment stock is deducted ("Mark shipped" and the edit dialog's
-- shipped/delivered transition, both of which call this same function) --
-- there was no check there at all, unlike the borrow flow's approval step
-- (decide_borrow_request), which already rejects an approval that would
-- exceed on-hand.
--
-- This adds the same kind of guard, in the one place it actually needs to
-- live: before writing any deduction, each product's needed delta is
-- checked against its current on-hand (summed from inventory_adjustments,
-- same table being written to). Any product that would go negative aborts
-- the whole call -- hard block, no override, matching the borrow flow
-- exactly. Since the check runs before any INSERT and a plpgsql exception
-- rolls back everything the function did so far, a ticket with several
-- lines where only one is short deducts nothing at all, not a partial set.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.ship_shipping_ticket_inventory(_ticket_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.shipping_tickets;
  _actor UUID := auth.uid();
  _r RECORD;
  _current_on_hand NUMERIC;
  _part_number TEXT;
BEGIN
  SELECT * INTO _ticket FROM public.shipping_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipping ticket not found';
  END IF;

  IF NOT public.can_write_project(_actor, _ticket.project_id) THEN
    RAISE EXCEPTION 'Not permitted to modify inventory for this ticket';
  END IF;

  FOR _r IN
    -- wanted: current per-product shipped quantity from the ticket's line items.
    -- existing: net already recorded in the ledger for this ticket, per product.
    -- delta is the change needed to bring existing in line with -wanted,
    -- covering new products (existing NULL), removed products (wanted
    -- NULL, reconciled back toward zero), and changed quantities alike.
    SELECT
      COALESCE(w.product_id, e.product_id) AS product_id,
      (-COALESCE(w.qty_shipped, 0)) - COALESCE(e.net, 0) AS delta
    FROM (
      SELECT product_id, SUM(qty_shipped) AS qty_shipped
      FROM public.shipping_ticket_items
      WHERE ticket_id = _ticket_id AND product_id IS NOT NULL
      GROUP BY product_id
    ) w
    FULL OUTER JOIN (
      SELECT product_id, SUM(delta) AS net
      FROM public.inventory_adjustments
      WHERE source_type = 'shipping_ticket' AND source_id = _ticket_id
      GROUP BY product_id
    ) e ON e.product_id = w.product_id
    WHERE (-COALESCE(w.qty_shipped, 0)) - COALESCE(e.net, 0) <> 0
  LOOP
    IF _r.delta < 0 THEN
      SELECT COALESCE(SUM(delta), 0) INTO _current_on_hand
      FROM public.inventory_adjustments
      WHERE project_id = _ticket.project_id AND product_id = _r.product_id;

      IF _current_on_hand + _r.delta < 0 THEN
        SELECT part_number INTO _part_number FROM public.products WHERE id = _r.product_id;
        RAISE EXCEPTION 'Only % on hand for %. Cannot ship % more.',
          _current_on_hand, COALESCE(_part_number, 'this product'), ABS(_r.delta);
      END IF;
    END IF;

    INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
    VALUES (
      _ticket.project_id, _r.product_id, _r.delta, 'shipping_ticket', _ticket_id,
      'Shipped on ticket ' || _ticket.ticket_number, _actor
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ship_shipping_ticket_inventory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ship_shipping_ticket_inventory(UUID) TO authenticated;

COMMIT;
