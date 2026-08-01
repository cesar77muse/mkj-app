-- 1. Profiles: own profile or admin
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Name-only directory so the UI can show who requested/decided without exposing emails
CREATE OR REPLACE VIEW public.profiles_directory AS
  SELECT id, full_name FROM public.profiles;
REVOKE ALL ON public.profiles_directory FROM anon;
GRANT SELECT ON public.profiles_directory TO authenticated;

-- 2. Project assignment tables
DROP POLICY IF EXISTS pm_select ON public.project_managers;
CREATE POLICY pm_select ON public.project_managers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.can_see_project(auth.uid(), project_id));

DROP POLICY IF EXISTS pe_select ON public.project_engineers;
CREATE POLICY pe_select ON public.project_engineers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.can_see_project(auth.uid(), project_id));

-- 3. Suppliers: writers, or users tied to a project that purchased from them
DROP POLICY IF EXISTS suppliers_select ON public.suppliers;
CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.can_write(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.supplier_id = suppliers.id AND public.can_see_project(auth.uid(), p.project_id)
    )
  );

-- 4. Storage policies
DROP POLICY IF EXISTS po_pdfs_read ON storage.objects;
CREATE POLICY po_pdfs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-order-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.purchase_order_pdfs pd
      JOIN public.purchase_orders p ON p.id = pd.po_id
      WHERE pd.storage_path = storage.objects.name
        AND public.can_see_project(auth.uid(), p.project_id)
    )
  );

DROP POLICY IF EXISTS app_assets_read ON storage.objects;
CREATE POLICY app_assets_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'app-assets');

DROP POLICY IF EXISTS app_assets_write ON storage.objects;
CREATE POLICY app_assets_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-assets' AND public.can_write(auth.uid()));

DROP POLICY IF EXISTS app_assets_update ON storage.objects;
CREATE POLICY app_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'app-assets' AND public.can_write(auth.uid()))
  WITH CHECK (bucket_id = 'app-assets' AND public.can_write(auth.uid()));

DROP POLICY IF EXISTS app_assets_delete ON storage.objects;
CREATE POLICY app_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-assets' AND public.is_warehouse_or_admin(auth.uid()));

-- 5. Function execution privileges
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Predicates used inside RLS policies must stay callable by signed-in users
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_warehouse_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid, uuid, text, text, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_ps_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_ticket_number() TO authenticated;