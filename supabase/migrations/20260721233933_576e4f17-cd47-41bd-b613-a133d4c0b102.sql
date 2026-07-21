
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'warehouse_manager', 'manager', 'engineer');
CREATE TYPE public.project_status AS ENUM ('active', 'on_hold', 'closed');
CREATE TYPE public.po_status AS ENUM ('draft','approved','executed','partially_received','received','closed');
CREATE TYPE public.ticket_status AS ENUM ('draft','ready','shipped','delivered');
CREATE TYPE public.borrow_status AS ENUM ('pending','approved','partially_approved','denied','fulfilled','returned');
CREATE TYPE public.ledger_source AS ENUM ('packing_slip','shipping_ticket','manual_adjustment','borrow_out','borrow_in','borrow_return_out','borrow_return_in','initial');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.is_warehouse_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','warehouse_manager')) $$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','warehouse_manager','manager')) $$;

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mkj_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  contract_number TEXT,
  status public.project_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_managers (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.project_managers TO authenticated;
GRANT ALL ON public.project_managers TO service_role;
ALTER TABLE public.project_managers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_engineers (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.project_engineers TO authenticated;
GRANT ALL ON public.project_engineers TO service_role;
ALTER TABLE public.project_engineers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.manages_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.project_managers WHERE user_id = _user_id AND project_id = _project_id) $$;

CREATE OR REPLACE FUNCTION public.can_see_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_warehouse_or_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.project_managers WHERE user_id = _user_id AND project_id = _project_id)
    OR EXISTS (SELECT 1 FROM public.project_engineers WHERE user_id = _user_id AND project_id = _project_id)
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_warehouse_or_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.project_managers WHERE user_id = _user_id AND project_id = _project_id)
$$;

-- Projects policies
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), id));
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
WITH CHECK (public.is_warehouse_or_admin(auth.uid()));
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
USING (public.is_warehouse_or_admin(auth.uid())) WITH CHECK (public.is_warehouse_or_admin(auth.uid()));
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Project managers/engineers policies
CREATE POLICY "pm_select" ON public.project_managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pm_write" ON public.project_managers FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "pe_select" ON public.project_engineers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pe_write" ON public.project_engineers FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  contact_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated
USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ea',
  reorder_point INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_write" ON public.products FOR ALL TO authenticated
USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- ============ PURCHASE ORDERS ============
CREATE SEQUENCE public.po_seq START 1;

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES public.suppliers(id),
  bill_to TEXT,
  ship_to TEXT,
  status public.po_status NOT NULL DEFAULT 'draft',
  payment_terms TEXT,
  ship_via TEXT,
  delivery_date DATE,
  description TEXT,
  terms_conditions TEXT,
  additional_freight NUMERIC(12,2) DEFAULT 0,
  assignee UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), project_id));
CREATE POLICY "po_write" ON public.purchase_orders FOR ALL TO authenticated
USING (public.can_write_project(auth.uid(), project_id))
WITH CHECK (public.can_write_project(auth.uid(), project_id));

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  budget_code TEXT,
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  qty NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ea',
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_select" ON public.purchase_order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_see_project(auth.uid(), p.project_id)));
CREATE POLICY "poi_write" ON public.purchase_order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_write_project(auth.uid(), p.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.can_write_project(auth.uid(), p.project_id)));

-- ============ PACKING SLIPS ============
CREATE SEQUENCE public.ps_seq START 1;

CREATE TABLE public.packing_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_number TEXT NOT NULL UNIQUE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES auth.users(id),
  carrier TEXT,
  vendor_slip_number TEXT,
  notes TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_slips TO authenticated;
GRANT ALL ON public.packing_slips TO service_role;
ALTER TABLE public.packing_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_select" ON public.packing_slips FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), project_id));
CREATE POLICY "ps_write" ON public.packing_slips FOR ALL TO authenticated
USING (public.can_write_project(auth.uid(), project_id))
WITH CHECK (public.can_write_project(auth.uid(), project_id));

CREATE TABLE public.packing_slip_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id UUID NOT NULL REFERENCES public.packing_slips(id) ON DELETE CASCADE,
  po_item_id UUID REFERENCES public.purchase_order_items(id),
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  qty_ordered NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'ok'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_slip_items TO authenticated;
GRANT ALL ON public.packing_slip_items TO service_role;
ALTER TABLE public.packing_slip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psi_select" ON public.packing_slip_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.packing_slips s WHERE s.id = slip_id AND public.can_see_project(auth.uid(), s.project_id)));
CREATE POLICY "psi_write" ON public.packing_slip_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.packing_slips s WHERE s.id = slip_id AND public.can_write_project(auth.uid(), s.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.packing_slips s WHERE s.id = slip_id AND public.can_write_project(auth.uid(), s.project_id)));

-- ============ SHIPPING TICKETS ============
CREATE SEQUENCE public.ticket_seq START 4975;

CREATE TABLE public.shipping_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ship_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deliver_to_name TEXT,
  deliver_to_address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  ship_by TEXT,
  contract_number TEXT,
  po_reference TEXT,
  status public.ticket_status NOT NULL DEFAULT 'draft',
  delivered_by TEXT,
  received_by TEXT,
  signature_url TEXT,
  pass_number TEXT,
  received_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_tickets TO authenticated;
GRANT ALL ON public.shipping_tickets TO service_role;
ALTER TABLE public.shipping_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_select" ON public.shipping_tickets FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), project_id));
CREATE POLICY "st_write" ON public.shipping_tickets FOR ALL TO authenticated
USING (public.can_write_project(auth.uid(), project_id))
WITH CHECK (public.can_write_project(auth.uid(), project_id));

CREATE TABLE public.shipping_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.shipping_tickets(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  qty_shipped NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_backordered NUMERIC(12,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_ticket_items TO authenticated;
GRANT ALL ON public.shipping_ticket_items TO service_role;
ALTER TABLE public.shipping_ticket_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sti_select" ON public.shipping_ticket_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.shipping_tickets t WHERE t.id = ticket_id AND public.can_see_project(auth.uid(), t.project_id)));
CREATE POLICY "sti_write" ON public.shipping_ticket_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.shipping_tickets t WHERE t.id = ticket_id AND public.can_write_project(auth.uid(), t.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.shipping_tickets t WHERE t.id = ticket_id AND public.can_write_project(auth.uid(), t.project_id)));

-- ============ INVENTORY LEDGER ============
CREATE TABLE public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  delta NUMERIC(12,2) NOT NULL,
  source_type public.ledger_source NOT NULL,
  source_id UUID,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_select" ON public.inventory_adjustments FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), project_id));
CREATE POLICY "inv_insert" ON public.inventory_adjustments FOR INSERT TO authenticated
WITH CHECK (public.can_write_project(auth.uid(), project_id));

CREATE OR REPLACE VIEW public.v_project_inventory AS
SELECT project_id, product_id, SUM(delta) AS on_hand
FROM public.inventory_adjustments
GROUP BY project_id, product_id;
GRANT SELECT ON public.v_project_inventory TO authenticated;

-- ============ BORROW REQUESTS ============
CREATE TABLE public.borrow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  target_project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty_requested NUMERIC(12,2) NOT NULL,
  qty_approved NUMERIC(12,2),
  status public.borrow_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  decision_note TEXT,
  needed_by DATE,
  requested_by UUID REFERENCES auth.users(id),
  decided_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  CHECK (source_project_id <> target_project_id)
);
GRANT SELECT, INSERT, UPDATE ON public.borrow_requests TO authenticated;
GRANT ALL ON public.borrow_requests TO service_role;
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "br_select" ON public.borrow_requests FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), source_project_id) OR public.can_see_project(auth.uid(), target_project_id));
-- Insert: caller must be able to write the target project (they need it)
CREATE POLICY "br_insert" ON public.borrow_requests FOR INSERT TO authenticated
WITH CHECK (public.can_write_project(auth.uid(), target_project_id));
-- Update (approve/deny/fulfill): source project managers or warehouse/admin
CREATE POLICY "br_update" ON public.borrow_requests FOR UPDATE TO authenticated
USING (public.can_write_project(auth.uid(), source_project_id))
WITH CHECK (public.can_write_project(auth.uid(), source_project_id));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT TO authenticated
USING (recipient_user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated
USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY "notif_insert_auth" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

-- ============ AUTO updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_suppliers_upd BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_st_upd BEFORE UPDATE ON public.shipping_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AUTO PROFILE + FIRST ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  -- First-ever user becomes admin so the app is usable out of the box
  SELECT COUNT(*) INTO _count FROM public.user_roles;
  IF _count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ NUMBER GENERATION ============
CREATE OR REPLACE FUNCTION public.gen_po_number(_mkj TEXT) RETURNS TEXT
LANGUAGE SQL VOLATILE SET search_path = public
AS $$ SELECT _mkj || '-PO-' || LPAD(nextval('public.po_seq')::TEXT, 4, '0') $$;

CREATE OR REPLACE FUNCTION public.gen_ps_number(_mkj TEXT) RETURNS TEXT
LANGUAGE SQL VOLATILE SET search_path = public
AS $$ SELECT _mkj || '-PS-' || LPAD(nextval('public.ps_seq')::TEXT, 4, '0') $$;

CREATE OR REPLACE FUNCTION public.gen_ticket_number() RETURNS TEXT
LANGUAGE SQL VOLATILE SET search_path = public
AS $$ SELECT 'S' || LPAD(nextval('public.ticket_seq')::TEXT, 5, '0') $$;
