import { createFileRoute, ClientOnly, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  // ssr: false — defer mounting until after hydration so the server/client
  // first paint matches; see
  // https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors
  component: () => (
    <ClientOnly fallback={null}>
      <AppShell>
        <Outlet />
      </AppShell>
    </ClientOnly>
  ),
});
