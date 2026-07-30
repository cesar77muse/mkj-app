-- 1. New status value for withdrawn requests
ALTER TYPE public.borrow_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Allow the requester to cancel their own pending request
DROP POLICY IF EXISTS br_cancel_own ON public.borrow_requests;
CREATE POLICY br_cancel_own ON public.borrow_requests
FOR UPDATE TO authenticated
USING (requested_by = auth.uid())
WITH CHECK (requested_by = auth.uid());

-- 3. Fix missing project manager assignment (keeps projects.project_manager_id in sync)
INSERT INTO public.project_managers (user_id, project_id)
SELECT p.project_manager_id, p.id
FROM public.projects p
WHERE p.project_manager_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep the assignment table in sync whenever the project manager changes
CREATE OR REPLACE FUNCTION public.sync_project_manager_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_manager_id IS NOT NULL THEN
    INSERT INTO public.project_managers (user_id, project_id)
    VALUES (NEW.project_manager_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projects_sync_pm ON public.projects;
CREATE TRIGGER trg_projects_sync_pm
AFTER INSERT OR UPDATE OF project_manager_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.sync_project_manager_assignment();
