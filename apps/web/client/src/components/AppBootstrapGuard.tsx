import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AppPageErrorState, AppPageShell } from "@/components/internal-page-system";
import { useAuth, type AuthBootstrapState } from "@/contexts/AuthContext";
import { extractPathname, isPublicOrAuthPath } from "@/lib/routeAccess";
import { pushAuditEvent, setAuditField } from "@/lib/renderAudit";

export type AppBootstrapState = AuthBootstrapState;

export type AppBootstrapGuardBranch =
  | "blocking_error"
  | "blocking_degraded"
  | "pass_through";

export function resolveAppBootstrapGuardBranch(params: {
  state: AppBootstrapState | "unknown";
  isPublicBootstrapPath: boolean;
}): AppBootstrapGuardBranch {
  if (params.isPublicBootstrapPath) return "pass_through";
  if (params.state === "error") return "blocking_error";
  if (params.state === "degraded") return "blocking_degraded";
  return "pass_through";
}

export function AppBootstrapGuard({
  state,
  reason,
  onReload,
  children,
}: {
  state: AppBootstrapState;
  reason?: string;
  onReload: () => void;
  children: ReactNode;
}) {
  const { authState } = useAuth();
  const [location] = useLocation();
  const pathname = extractPathname(location);
  const isPublicBootstrapPath = isPublicOrAuthPath(pathname);

  const guardBranch = useMemo(() => resolveAppBootstrapGuardBranch({
    state: (state as AppBootstrapState | "unknown") ?? "unknown",
    isPublicBootstrapPath,
  }), [isPublicBootstrapPath, state]);

  useEffect(() => {
    setAuditField("bootstrapBranch", `guard:${guardBranch}`);
    pushAuditEvent("bootstrap", "guard", {
      pathname,
      state,
      authState,
      guardBranch,
      isPublicBootstrapPath,
      hasChildren: Boolean(children),
    });
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[BOOTSTRAP] guard", {
      at: new Date().toISOString(),
      route: pathname,
      appBootstrapState: state,
      authState,
      isPublicBootstrapPath,
      branch: guardBranch,
      hasChildren: Boolean(children),
    });
  }, [authState, children, guardBranch, isPublicBootstrapPath, pathname, state]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[BOOTSTRAP] guard mount");
    return () => {
      // eslint-disable-next-line no-console
      console.info("[BOOTSTRAP] guard unmount");
    };
  }, []);

  if (state === "validating" && !isPublicBootstrapPath) {
    return (
      <>
        {children}
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-white/95 px-3 py-1.5 text-xs text-[var(--text-secondary)] shadow-sm backdrop-blur dark:border-orange-500/20 dark:bg-[var(--surface-base)]">
            Inicializando autenticação em segundo plano...
          </div>
        </div>
      </>
    );
  }

  if (guardBranch === "blocking_degraded") {
    setAuditField("errorType", "bootstrap_degraded");
    return (
      <AppPageShell>
        <AppPageErrorState
          title="Sessão temporariamente indisponível"
          description="Não foi possível validar sua sessão agora. Tente novamente em alguns instantes."
          actionLabel="Tentar novamente"
          onAction={onReload}
        />
      </AppPageShell>
    );
  }

  if (guardBranch === "blocking_error") {
    setAuditField("errorType", "bootstrap");
    return (
      <AppPageShell>
        <AppPageErrorState
          title="Falha ao iniciar a aplicação"
          description={reason ?? "Não foi possível concluir o bootstrap inicial."}
          actionLabel="Recarregar aplicação"
          onAction={onReload}
        />
      </AppPageShell>
    );
  }

  if (
    state !== "validating" &&
    state !== "degraded" &&
    state !== "error" &&
    state !== "authenticated" &&
    state !== "unauthenticated"
  ) {
    setAuditField("errorType", "bootstrap");
    return (
      <div className="nexo-app-shell flex min-h-screen items-center justify-center px-6">
        <div className="nexo-app-panel-strong w-full max-w-md p-6">
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-white">Fallback Bootstrap</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
            Estado inesperado de bootstrap ({String(state)}). Recarregue para continuar.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
