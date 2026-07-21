
-- Recreate view with security_invoker so caller RLS applies
DROP VIEW IF EXISTS public.v_project_inventory;
CREATE VIEW public.v_project_inventory WITH (security_invoker = true) AS
SELECT project_id, product_id, SUM(delta) AS on_hand
FROM public.inventory_adjustments
GROUP BY project_id, product_id;
GRANT SELECT ON public.v_project_inventory TO authenticated;

-- Revoke public/anon execution on SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_warehouse_or_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manages_project(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_project(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_project(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gen_po_number(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gen_ps_number(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gen_ticket_number() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_warehouse_or_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_po_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_ps_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_ticket_number() TO authenticated;

-- Replace permissive notifications insert with recipient-only rule.
-- System-created notifications go through service_role or SECURITY DEFINER triggers, which bypass this.
DROP POLICY IF EXISTS "notif_insert_auth" ON public.notifications;
CREATE POLICY "notif_insert_self" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (recipient_user_id = auth.uid());
