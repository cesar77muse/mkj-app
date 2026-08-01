
-- ============ SHIPPING TICKET SHIP-SIDE INVENTORY RECONCILIATION ============
-- Symmetric counterpart to reverse_shipping_ticket_inventory() (see migration
-- 20260801214513). That function reconciles a ticket's ledger toward "fully
-- reversed" (net zero); this one reconciles toward "fully deducted to match
-- current line items" (net = -qty_shipped per product).
--
-- Why a reconciliation rather than a one-shot insert: the existing
-- "Mark shipped" button (shipMut in shipping-tickets.$id.tsx) already does a
-- simple one-shot insert and is left as-is — it only ever runs once, from
-- draft/ready. But the edit dialog's status dropdown can also set a ticket
-- straight to "shipped" (or "delivered"), and the same Save button is used
-- to edit quantities on a ticket that's already shipped. A one-shot insert
-- guarded only by "was it already shipped" is fragile — this reconciles to
-- the current line items every time, so it's safe to call on every save
-- regardless of prior state, and it also fixes quantities silently drifting
-- out of sync with the ledger if line items are edited after shipping.
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
BEGIN
  SELECT * INTO _ticket FROM public.shipping_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipping ticket not found';
  END IF;

  IF NOT public.can_write_project(_actor, _ticket.project_id) THEN
    RAISE EXCEPTION 'Not permitted to modify inventory for this ticket';
  END IF;

  -- wanted: current per-product shipped quantity from the ticket's line items.
  -- existing: net already recorded in the ledger for this ticket, per product.
  -- Insert only the delta needed to bring existing in line with -wanted,
  -- covering new products (existing NULL), removed products (wanted NULL,
  -- reconciled back toward zero), and changed quantities alike.
  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  SELECT
    _ticket.project_id,
    COALESCE(w.product_id, e.product_id),
    (-COALESCE(w.qty_shipped, 0)) - COALESCE(e.net, 0),
    'shipping_ticket',
    _ticket_id,
    'Shipped on ticket ' || _ticket.ticket_number,
    _actor
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
  WHERE (-COALESCE(w.qty_shipped, 0)) - COALESCE(e.net, 0) <> 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ship_shipping_ticket_inventory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ship_shipping_ticket_inventory(UUID) TO authenticated;

COMMIT;
