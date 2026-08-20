-- ============ SERIAL NUMBER TRACKING: RECEIVING + SHIPPING ============
-- Sensitive parts (switches, servers, crypto/security modules) have to be
-- traceable by unit, not just by quantity. products.is_serialized already
-- exists (20260819232602) and flags which parts get that treatment; this
-- migration adds the two capture tables behind it plus the view the
-- Inventory page and the shipping-ticket serial picker read.
--
-- Shape is dictated by the frontend already shipped in src/lib/serials.ts
-- (packing_slip_item_serials.slip_item_id / shipping_ticket_item_serials
-- .ticket_item_id / v_project_serials), which fails soft until this lands:
-- it probes products.is_serialized and hides every serial control if the
-- probe errors. Nothing in the UI changes shape because of this file.
--
-- DESIGN: serials are DERIVED, not a separate registry. A serial exists
-- because a packing slip recorded it, exactly like on-hand quantity exists
-- because the inventory_adjustments ledger recorded it -- same reasoning as
-- v_project_inventory. There is no second source of truth to drift.
--
-- Consequences worth knowing:
--   * Stock that predates serial tracking (opening balances, anything
--     received before a part was flagged) has no serials. That is expected
--     and displays as "5 on hand, 2 serials" -- serials are optional
--     everywhere by design, never a hard block on saving a slip.
--   * Serials on a damaged/rejected slip line are NOT on hand, matching
--     sync_packing_slip_inventory's `condition = 'ok'` filter (F-08). The
--     serial is still visible on the packing slip itself, which is the
--     point -- you can trace which unit arrived broken.
--   * A serial counts as SHIPPED only once its ticket is actually shipped
--     or delivered, mirroring ship_shipping_ticket_inventory, which does
--     not decrement quantity for a draft/ready ticket either. Picking a
--     serial on an unshipped ticket does not take it out of stock.
--
-- DUPLICATES are rejected, per-part, across every slip: two units cannot
-- share a serial, and allowing it would defeat the entire feature. This is
-- the one hard block in serial handling -- MISSING serials stay soft
-- everywhere.
--
-- Borrowing is handled in the next migration, which replaces
-- v_project_serials with a borrow-aware version (a borrowed unit is
-- physically at the borrowing project, so it must be listed there).
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

-- Already added by 20260819232602; repeated so this file stands alone.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------
-- RECEIVED SERIALS (one row per physical unit captured on a slip line)
-- ---------------------------------------------------------------
-- product_id is denormalized from the parent slip line. It is not a
-- convenience: it is what lets a unique index enforce "one serial per
-- part" without a cross-table subquery, and it keeps v_project_serials
-- from joining through two tables per row. Trigger-maintained below, so
-- it can never disagree with the line it hangs off.
CREATE TABLE IF NOT EXISTS public.packing_slip_item_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_item_id UUID NOT NULL REFERENCES public.packing_slip_items(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  serial TEXT NOT NULL CHECK (btrim(serial) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_psis_slip_item ON public.packing_slip_item_serials (slip_item_id);
CREATE INDEX IF NOT EXISTS idx_psis_product   ON public.packing_slip_item_serials (product_id);
-- The hard guarantee behind the friendly trigger error below. Serials are
-- stored trimmed (trigger), so upper(serial) is the comparison key.
CREATE UNIQUE INDEX IF NOT EXISTS ux_psis_product_serial
  ON public.packing_slip_item_serials (product_id, upper(serial));

-- ---------------------------------------------------------------
-- SHIPPED SERIALS (which specific units went out on a ticket line)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_ticket_item_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_item_id UUID NOT NULL REFERENCES public.shipping_ticket_items(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  serial TEXT NOT NULL CHECK (btrim(serial) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_stis_ticket_item ON public.shipping_ticket_item_serials (ticket_item_id);
CREATE INDEX IF NOT EXISTS idx_stis_product     ON public.shipping_ticket_item_serials (product_id);
-- Only scoped to the line, deliberately: shipping the same serial twice is
-- wrong, but it is wrong in a way that means stock records disagree, and
-- blocking the save would strand the user with no way to correct the
-- earlier ticket. v_project_serials shows the unit as gone either way.
CREATE UNIQUE INDEX IF NOT EXISTS ux_stis_item_serial
  ON public.shipping_ticket_item_serials (ticket_item_id, upper(serial));

-- ---------------------------------------------------------------
-- TRIGGERS: normalize, stamp, denormalize, then reject duplicates
-- ---------------------------------------------------------------
-- Numbered names (10_/20_) because Postgres fires same-event triggers in
-- name order: product_id must be filled in before the check that reads it.
CREATE OR REPLACE FUNCTION public.slip_serial_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.serial := btrim(NEW.serial);
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  SELECT i.product_id INTO NEW.product_id
  FROM public.packing_slip_items i WHERE i.id = NEW.slip_item_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ticket_serial_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.serial := btrim(NEW.serial);
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  SELECT i.product_id INTO NEW.product_id
  FROM public.shipping_ticket_items i WHERE i.id = NEW.ticket_item_id;
  RETURN NEW;
END; $$;

-- SECURITY DEFINER so the check sees serials on projects the caller can't
-- read -- otherwise a cross-project collision would slip past this and
-- surface as a raw "duplicate key value violates unique constraint", which
-- tells a warehouse user nothing. The slip number is only named when the
-- caller is allowed to see that project; otherwise the message stays
-- deliberately vague rather than leaking where the unit lives.
CREATE OR REPLACE FUNCTION public.check_slip_serial_unique()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _slip_number TEXT;
  _project UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.slip_number, s.project_id INTO _slip_number, _project
  FROM public.packing_slip_item_serials x
  JOIN public.packing_slip_items i ON i.id = x.slip_item_id
  JOIN public.packing_slips s ON s.id = i.slip_id
  WHERE x.product_id = NEW.product_id
    AND upper(x.serial) = upper(NEW.serial)
    AND x.id <> NEW.id
  LIMIT 1;

  IF _slip_number IS NOT NULL THEN
    IF public.can_see_project(auth.uid(), _project) THEN
      RAISE EXCEPTION 'Serial "%" is already recorded for this part on packing slip %.', NEW.serial, _slip_number;
    ELSE
      RAISE EXCEPTION 'Serial "%" is already recorded for this part on another project''s receipt.', NEW.serial;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_psis_10_defaults ON public.packing_slip_item_serials;
CREATE TRIGGER trg_psis_10_defaults
BEFORE INSERT OR UPDATE ON public.packing_slip_item_serials
FOR EACH ROW EXECUTE FUNCTION public.slip_serial_defaults();

DROP TRIGGER IF EXISTS trg_psis_20_unique ON public.packing_slip_item_serials;
CREATE TRIGGER trg_psis_20_unique
BEFORE INSERT OR UPDATE ON public.packing_slip_item_serials
FOR EACH ROW EXECUTE FUNCTION public.check_slip_serial_unique();

DROP TRIGGER IF EXISTS trg_stis_10_defaults ON public.shipping_ticket_item_serials;
CREATE TRIGGER trg_stis_10_defaults
BEFORE INSERT OR UPDATE ON public.shipping_ticket_item_serials
FOR EACH ROW EXECUTE FUNCTION public.ticket_serial_defaults();

-- Editing a slip/ticket line's product (the edit dialogs allow it) has to
-- drag the denormalized product_id along, or the serial would stay filed
-- under the old part.
CREATE OR REPLACE FUNCTION public.resync_slip_item_serial_product()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.packing_slip_item_serials SET product_id = NEW.product_id WHERE slip_item_id = NEW.id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.resync_ticket_item_serial_product()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.shipping_ticket_item_serials SET product_id = NEW.product_id WHERE ticket_item_id = NEW.id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_psi_product_resync ON public.packing_slip_items;
CREATE TRIGGER trg_psi_product_resync
AFTER UPDATE OF product_id ON public.packing_slip_items
FOR EACH ROW WHEN (NEW.product_id IS DISTINCT FROM OLD.product_id)
EXECUTE FUNCTION public.resync_slip_item_serial_product();

DROP TRIGGER IF EXISTS trg_sti_product_resync ON public.shipping_ticket_items;
CREATE TRIGGER trg_sti_product_resync
AFTER UPDATE OF product_id ON public.shipping_ticket_items
FOR EACH ROW WHEN (NEW.product_id IS DISTINCT FROM OLD.product_id)
EXECUTE FUNCTION public.resync_ticket_item_serial_product();

-- ---------------------------------------------------------------
-- RLS -- mirrors the parent line's policies exactly (psi_* / sti_*), so a
-- serial is readable/writable by whoever can already read/write the slip
-- or ticket it belongs to. Engineers land on read-only for free, since
-- can_write_project already encodes that.
-- ---------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_slip_item_serials TO authenticated;
GRANT ALL ON public.packing_slip_item_serials TO service_role;
ALTER TABLE public.packing_slip_item_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psis_select" ON public.packing_slip_item_serials;
CREATE POLICY "psis_select" ON public.packing_slip_item_serials FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.packing_slip_items i
  JOIN public.packing_slips s ON s.id = i.slip_id
  WHERE i.id = slip_item_id AND public.can_see_project(auth.uid(), s.project_id)
));

DROP POLICY IF EXISTS "psis_write" ON public.packing_slip_item_serials;
CREATE POLICY "psis_write" ON public.packing_slip_item_serials FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.packing_slip_items i
  JOIN public.packing_slips s ON s.id = i.slip_id
  WHERE i.id = slip_item_id AND public.can_write_project(auth.uid(), s.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.packing_slip_items i
  JOIN public.packing_slips s ON s.id = i.slip_id
  WHERE i.id = slip_item_id AND public.can_write_project(auth.uid(), s.project_id)
));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_ticket_item_serials TO authenticated;
GRANT ALL ON public.shipping_ticket_item_serials TO service_role;
ALTER TABLE public.shipping_ticket_item_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stis_select" ON public.shipping_ticket_item_serials;
CREATE POLICY "stis_select" ON public.shipping_ticket_item_serials FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shipping_ticket_items i
  JOIN public.shipping_tickets t ON t.id = i.ticket_id
  WHERE i.id = ticket_item_id AND public.can_see_project(auth.uid(), t.project_id)
));

DROP POLICY IF EXISTS "stis_write" ON public.shipping_ticket_item_serials;
CREATE POLICY "stis_write" ON public.shipping_ticket_item_serials FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shipping_ticket_items i
  JOIN public.shipping_tickets t ON t.id = i.ticket_id
  WHERE i.id = ticket_item_id AND public.can_write_project(auth.uid(), t.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.shipping_ticket_items i
  JOIN public.shipping_tickets t ON t.id = i.ticket_id
  WHERE i.id = ticket_item_id AND public.can_write_project(auth.uid(), t.project_id)
));

-- ---------------------------------------------------------------
-- v_project_serials -- "which units are where"
-- ---------------------------------------------------------------
-- Same visibility model as v_project_inventory: a plain view (runs with
-- the owner's privileges) guarded by has_any_role(), so every real user
-- sees serials across projects -- which is exactly what the Inventory page
-- and the borrow flow already assume for quantities -- while a role-less
-- signup sees nothing.
--
-- The next migration replaces this with a borrow-aware version, which is
-- why the create is guarded: re-running THIS file afterwards must not
-- quietly reinstate the version that files a borrowed unit under the
-- lending project again.
DO $do$
BEGIN
  IF to_regclass('public.borrow_request_serials') IS NOT NULL THEN
    RAISE NOTICE 'Borrow serial migration already applied — keeping the borrow-aware v_project_serials.';
  ELSE
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.v_project_serials AS
      SELECT
        s.project_id,
        r.product_id,
        r.serial,
        CASE WHEN EXISTS (
          SELECT 1
          FROM public.shipping_ticket_item_serials ts
          JOIN public.shipping_ticket_items ti ON ti.id = ts.ticket_item_id
          JOIN public.shipping_tickets t ON t.id = ti.ticket_id
          WHERE ts.product_id = r.product_id
            AND upper(ts.serial) = upper(r.serial)
            AND t.status IN ('shipped', 'delivered')
        ) THEN 'shipped' ELSE 'in_stock' END AS status
      FROM public.packing_slip_item_serials r
      JOIN public.packing_slip_items i ON i.id = r.slip_item_id
      JOIN public.packing_slips s ON s.id = i.slip_id
      WHERE r.product_id IS NOT NULL
        AND i.condition = 'ok'
        AND public.has_any_role(auth.uid())
    $v$;
  END IF;
END $do$;

GRANT SELECT ON public.v_project_serials TO authenticated;

COMMIT;
