
-- ============ SHIPPING TICKET INVENTORY REVERSAL + DELETE ============
-- Reverses the inventory deduction shipMut makes on "Mark shipped"
-- (inventory_adjustments rows with source_type='shipping_ticket',
-- source_id=<ticket>). inventory_adjustments only grants SELECT/INSERT to
-- authenticated (no UPDATE/DELETE) — it's an append-only ledger, same as the
-- borrow_out/borrow_in vs borrow_return_out/borrow_return_in pattern already
-- used elsewhere. So "returning items to inventory" means inserting a
-- compensating positive-delta row per product, never touching the original
-- deduction rows.
--
-- reverse_shipping_ticket_inventory() computes the reversal from the actual
-- adjustment rows tied to the ticket (summed per product), not from the
-- ticket's current line items — those can drift from what was actually
-- deducted if items are edited after shipping, so the ledger itself is the
-- only correct source of truth for "what do we owe back." It's idempotent:
-- if the net for a product is already zero (nothing to reverse, or already
-- reversed), it inserts nothing, so it's safe to call more than once for the
-- same ticket.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.reverse_shipping_ticket_inventory(_ticket_id UUID)
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

  INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
  SELECT
    _ticket.project_id,
    ia.product_id,
    -SUM(ia.delta),
    'shipping_ticket',
    _ticket_id,
    'Reversed: ticket ' || _ticket.ticket_number || ' shipped-inventory deduction undone',
    _actor
  FROM public.inventory_adjustments ia
  WHERE ia.source_type = 'shipping_ticket' AND ia.source_id = _ticket_id
  GROUP BY ia.product_id
  HAVING SUM(ia.delta) <> 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_shipping_ticket_inventory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_shipping_ticket_inventory(UUID) TO authenticated;

-- Mirrors PODeleteButton's canDeletePO rule exactly: admin can always
-- delete; warehouse_manager only while the ticket hasn't reached its
-- furthest-along status ('delivered' here, 'received' for POs). Always
-- reverses any shipped-inventory deduction first, regardless of the
-- ticket's current status, per the "help admin/warehouse fix wrongly
-- created tickets" requirement.
CREATE OR REPLACE FUNCTION public.delete_shipping_ticket(_ticket_id UUID)
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

  IF NOT (
    public.is_admin(_actor)
    OR (public.is_warehouse_or_admin(_actor) AND _ticket.status <> 'delivered')
  ) THEN
    RAISE EXCEPTION 'Not permitted to delete this shipping ticket';
  END IF;

  PERFORM public.reverse_shipping_ticket_inventory(_ticket_id);

  DELETE FROM public.shipping_ticket_items WHERE ticket_id = _ticket_id;
  DELETE FROM public.shipping_tickets WHERE id = _ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_shipping_ticket(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shipping_ticket(UUID) TO authenticated;

COMMIT;
