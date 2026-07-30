ALTER TABLE public.projects
  ADD COLUMN project_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON public.projects(project_manager_id);