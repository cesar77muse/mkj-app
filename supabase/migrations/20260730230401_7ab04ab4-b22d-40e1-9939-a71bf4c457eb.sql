CREATE OR REPLACE FUNCTION public.borrow_notify_recipients(_project_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u FROM (
    SELECT project_manager_id AS u FROM public.projects WHERE id = _project_id AND project_manager_id IS NOT NULL
    UNION
    SELECT user_id FROM public.project_managers WHERE project_id = _project_id
    UNION
    SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'warehouse_manager')
  ) r WHERE u IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.borrow_notify_recipients(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_borrow_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_project_manager_assignment() FROM PUBLIC, anon, authenticated;
