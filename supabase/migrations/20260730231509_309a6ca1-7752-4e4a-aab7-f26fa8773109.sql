DROP POLICY IF EXISTS inv_select ON public.inventory_adjustments;
CREATE POLICY inv_select ON public.inventory_adjustments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated USING (true);