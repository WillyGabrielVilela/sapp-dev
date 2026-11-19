import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { obterSessaoFn } from "@/lib/auth.functions";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!(await obterSessaoFn())) throw redirect({ to: "/auth" });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
