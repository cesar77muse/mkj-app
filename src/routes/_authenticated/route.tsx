import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  // ssr: false already makes the router defer this route (and everything
  // under it) to a client-only render via its own internal ClientOnly/Suspense
  // wrapping (see MatchView in @tanstack/react-router's Match.tsx, gated on
  // match.ssr === false). Wrapping the component in a second, manual
  // <ClientOnly> here stacked a redundant boundary directly on top of that
  // one on every authenticated page — which is what was producing the
  // "Hydration failed... <Suspense>" console error on load. Let the route
  // option do it once; see
  // https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
