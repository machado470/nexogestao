import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { Route, Switch, useLocation } from "wouter";
import { Loader } from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConsentBanner } from "@/components/ConsentBanner";

import { AppBootstrapGuard, type AppBootstrapState } from "./components/AppBootstrapGuard";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AppLayout } from "./components/AppLayout";
import { PublicLayout } from "./components/PublicLayout";
import { AuthLayout } from "./components/AuthLayout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  BootProbeProvider,
  type BootProbeStage,
} from "./contexts/BootProbeContext";
import { canAny, type Permission, type Role } from "./lib/rbac";
import { setBootPhase } from "./lib/bootPhase";
import { extractPathname, isPublicOrAuthPath } from "./lib/routeAccess";
import { pushAuditEvent, setAuditField } from "./lib/renderAudit";

import Landing from "./pages/Landing";
import About from "./pages/About";
import ProductPage from "./pages/ProductPage";
import FunctionalitiesPage from "./pages/FunctionalitiesPage";
import PricingPage from "./pages/PricingPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import RegisterPage from "./pages/Register";

const Login = lazy(() => import("./pages/Login"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const AppointmentsPage = lazy(() => import("./pages/AppointmentsPage"));
const ServiceOrdersPage = lazy(() => import("./pages/ServiceOrdersPage"));
const PeoplePage = lazy(() => import("./pages/PeoplePage"));
const GovernancePage = lazy(() => import("./pages/GovernancePage"));
const FinancesPage = lazy(() => import("./pages/FinancesPage"));
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const WhatsAppWebhookRecoveryPage = lazy(() => import("./pages/WhatsAppWebhookRecoveryPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const OperationalCockpitPage = lazy(() => import("./pages/OperationalCockpitPage"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const ConfirmEmailPage = lazy(() => import("./pages/ConfirmEmailPage"));

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEnvelope(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null;

  if (isObject(payload.data) && isObject(payload.data.data)) {
    return payload.data.data;
  }

  return payload;
}

export function getRequiresOnboarding(payload: unknown): boolean {
  const env = getEnvelope(payload);
  return Boolean(env?.requiresOnboarding);
}

function bootLog(label: string, payload?: unknown) {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.log(label, payload ?? "");
}

function bootError(label: string, payload?: unknown) {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.error(label, payload ?? "");
}

function isRenderAuditEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("renderAudit") === "1";
}

function RenderAuditMarker({ label }: { label: string }) {
  if (!isRenderAuditEnabled()) return null;
  return (
    <div
      data-debug={label}
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 2147483646,
        background: "#1d4ed8",
        color: "#eff6ff",
        padding: "6px 10px",
        borderRadius: 6,
        font: "600 12px/1.2 system-ui",
      }}
    >
      {label}
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="nexo-app-shell flex min-h-screen items-center justify-center px-6">
      <div className="nexo-app-panel-strong flex w-full max-w-md items-center gap-3 p-6">
        <Loader className="h-5 w-5 animate-spin text-orange-500" />
        <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
          Carregando ambiente...
        </p>
      </div>
    </div>
  );
}

function AuthRouteLoader() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex items-start justify-center pt-5">
      <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-white/90 px-3 py-1.5 text-xs text-[var(--text-secondary)] shadow-sm backdrop-blur dark:border-orange-500/20 dark:bg-[var(--surface-base)] dark:text-[var(--text-secondary)]">
        <Loader className="h-3.5 w-3.5 animate-spin text-orange-500" />
        Sincronizando autenticação...
      </div>
    </div>
  );
}

function FullScreenMessage({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="nexo-app-shell flex min-h-screen items-center justify-center px-6">
      <div className="nexo-app-panel-strong w-full max-w-md p-6">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
          {description}
        </p>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LazyPage({
  component: Component,
  fallback = <FullScreenLoader />,
}: {
  component: LazyExoticComponent<ComponentType>;
  fallback?: ReactNode;
}) {
  return <Suspense fallback={fallback}><Component /></Suspense>;
}

function RedirectingScreen({ message }: { message: string }) {
  return <FullScreenMessage title="Redirecionando..." description={message} />;
}

export function buildLoginRedirectPath(currentPath: string) {
  const normalizedCurrentPath = currentPath.trim();
  if (!normalizedCurrentPath || normalizedCurrentPath === "/login") {
    return "/login";
  }

  const params = new URLSearchParams();
  params.set("redirect", normalizedCurrentPath);
  return `/login?${params.toString()}`;
}

export function readSafeRedirectFromPath(path: string): string | null {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  if (!query) return null;

  const params = new URLSearchParams(query);
  const raw = (params.get("redirect") ?? "").trim();

  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("/login")) return null;
  if (raw.startsWith("/register")) return null;
  if (raw.startsWith("/forgot-password")) return null;
  if (raw.startsWith("/reset-password")) return null;

  return raw;
}

function useOperationalStyleGuard() {
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    const forbidden = ["shadow-", "ring-", "backdrop-", "blur-"];

    const checkNode = (node: Element) => {
      const className = node.className;
      if (typeof className !== "string") return;

      if (!forbidden.some(token => className.includes(token))) return;
      if (node.tagName !== "BUTTON" && !node.closest("[data-operational='true']")) return;

      // eslint-disable-next-line no-console
      console.warn("[NexoGestao] Classe visual proibida em elemento operacional:", node);
    };

    document.querySelectorAll("button,[data-operational='true']").forEach(checkNode);
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          checkNode(mutation.target);
        }
      });
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
}

function ProtectedRoute({
  component: Component,
  permissions,
  requireCompletedOnboarding = false,
  onboardingOnly = false,
  requiredRoles,
}: {
  component: ComponentType;
  permissions?: Permission[];
  requiredRoles?: Role[];
  requireCompletedOnboarding?: boolean;
  onboardingOnly?: boolean;
}) {
  useOperationalStyleGuard();
  const { authState, isAuthenticated, payload, role } = useAuth();
  const [location, navigate] = useLocation();

  const requiresOnboarding = getRequiresOnboarding(payload);

  useEffect(() => {
    if (authState === "validating") return;

    if (!isAuthenticated) {
      if (location.startsWith("/login")) return;
      // eslint-disable-next-line no-console
      console.info("[ROUTER] protected_route_redirect", { from: location, to: "login" });
      navigate(buildLoginRedirectPath(location), { replace: true });
      return;
    }

    if (requireCompletedOnboarding && requiresOnboarding && location !== "/onboarding") {
      // eslint-disable-next-line no-console
      console.info("[ROUTER] protected_route_redirect", { from: location, to: "/onboarding" });
      navigate("/onboarding", { replace: true });
      return;
    }

    if (onboardingOnly && !requiresOnboarding && location !== "/executive-dashboard") {
      // eslint-disable-next-line no-console
      console.info("[ROUTER] protected_route_redirect", { from: location, to: "/executive-dashboard" });
      navigate("/executive-dashboard", { replace: true });
    }
  }, [
    authState,
    isAuthenticated,
    location,
    navigate,
    onboardingOnly,
    requireCompletedOnboarding,
    requiresOnboarding,
  ]);

  if (authState === "validating") {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return (
      <RedirectingScreen message="Sua sessão não está ativa. Você será enviado para o login." />
    );
  }

  if (requireCompletedOnboarding && requiresOnboarding) {
    return (
      <RedirectingScreen message="Seu acesso precisa passar pelo onboarding antes de continuar." />
    );
  }

  if (onboardingOnly && !requiresOnboarding) {
    return (
      <RedirectingScreen message="Seu onboarding já foi concluído. Voltando para o dashboard." />
    );
  }

  if ((requiredRoles?.length && (!role || !requiredRoles.includes(role))) ||
      (permissions?.length && (!role || !canAny(role, permissions)))) {
    return (
      <FullScreenMessage
        title="Acesso restrito"
        description="Seu perfil não tem permissão para acessar esta área."
        actionLabel="Voltar ao dashboard"
        onAction={() => navigate("/executive-dashboard")}
      />
    );
  }

  return <Component />;
}

function AuthRoute({ component: Component }: { component: ComponentType }) {
  const { authState, isAuthenticated, redirectTo } = useAuth();
  const [location, navigate] = useLocation();
  const redirectParam = readSafeRedirectFromPath(location);

  useEffect(() => {
    if (authState !== "validating" && isAuthenticated) {
      const nextRoute = redirectParam || redirectTo || "/executive-dashboard";
      if (location === nextRoute) return;
      // eslint-disable-next-line no-console
      console.info("[ROUTER] auth_route_redirect", { from: location, to: nextRoute });
      navigate(nextRoute, {
        replace: true,
      });
    }
  }, [authState, isAuthenticated, location, navigate, redirectParam, redirectTo]);

  if (authState === "validating") return <Component />;

  if (isAuthenticated) {
    return (
      <RedirectingScreen message="Sua sessão já está ativa. Redirecionando para a área interna." />
    );
  }

  return (
    <AuthLayout>
      <Component />
    </AuthLayout>
  );
}

function MarketingRoute({
  component: Component,
}: {
  component: ComponentType;
}) {
  const [location] = useLocation();
  bootLog("[ROUTER] marketing_route_render", { route: location, component: Component.name || "anonymous" });
  return (
    <PublicLayout>
      <Component />
    </PublicLayout>
  );
}

function withMainLayout(Page: ComponentType) {
  return function LayoutWrappedPage() {
    bootLog("[boot] render app");

    return (
      <AppLayout>
        <Page />
      </AppLayout>
    );
  };
}

function protectedPage(
  Page: ComponentType,
  options?: {
    permissions?: Permission[];
    requireCompletedOnboarding?: boolean;
    onboardingOnly?: boolean;
    requiredRoles?: Role[];
  }
) {
  const Wrapped = withMainLayout(Page);

  return function ProtectedPageRoute() {
    return (
      <ProtectedRoute
        component={Wrapped}
        permissions={options?.permissions}
        requireCompletedOnboarding={options?.requireCompletedOnboarding}
        onboardingOnly={options?.onboardingOnly}
        requiredRoles={options?.requiredRoles}
      />
    );
  };
}

function lazyProtectedPage(
  Page: LazyExoticComponent<ComponentType>,
  options?: {
    permissions?: Permission[];
    requireCompletedOnboarding?: boolean;
    onboardingOnly?: boolean;
    requiredRoles?: Role[];
  }
) {
  return protectedPage(
    () => <LazyPage component={Page} fallback={<FullScreenLoader />} />,
    options
  );
}

function publicPage(Page: ComponentType) {
  return function PublicPageRoute() {
    return <MarketingRoute component={Page} />;
  };
}

function authPage(Page: LazyExoticComponent<ComponentType>) {
  return function AuthPageRoute() {
    return (
      <AuthRoute
        component={() => <LazyPage component={Page} fallback={<AuthRouteLoader />} />}
      />
    );
  };
}

function onboardingPage(Page: LazyExoticComponent<ComponentType>) {
  return function OnboardingPageRoute() {
    return (
      <ProtectedRoute
        onboardingOnly
        component={() => <LazyPage component={Page} />}
      />
    );
  };
}

function directAuthPage(Page: ComponentType) {
  return function DirectAuthPageRoute() {
    return <AuthRoute component={Page} />;
  };
}

const CustomersRoute = lazyProtectedPage(CustomersPage, {
  permissions: ["customers:read"],
  requireCompletedOnboarding: true,
});

const AppointmentsRoute = lazyProtectedPage(AppointmentsPage, {
  permissions: ["appointments:read"],
  requireCompletedOnboarding: true,
});

const ServiceOrdersRoute = lazyProtectedPage(ServiceOrdersPage, {
  permissions: ["orders:read"],
  requireCompletedOnboarding: true,
});

const FinancesRoute = lazyProtectedPage(FinancesPage, {
  permissions: ["finance:read"],
  requireCompletedOnboarding: true,
});

const PeopleRoute = lazyProtectedPage(PeoplePage, {
  permissions: ["people:manage"],
  requireCompletedOnboarding: true,
});

const GovernanceRoute = lazyProtectedPage(GovernancePage, {
  permissions: ["governance:read"],
  requireCompletedOnboarding: true,
});

const ExecutiveDashboardRoute = lazyProtectedPage(ExecutiveDashboard, {
  requireCompletedOnboarding: true,
});

const WhatsAppRoute = lazyProtectedPage(WhatsAppPage, {
  requireCompletedOnboarding: true,
});

const WhatsAppWebhookRecoveryRoute = lazyProtectedPage(WhatsAppWebhookRecoveryPage, {
  requireCompletedOnboarding: true,
});

const CalendarRoute = lazyProtectedPage(CalendarPage, {
  permissions: ["appointments:read"],
  requireCompletedOnboarding: true,
});

const SettingsRoute = lazyProtectedPage(SettingsPage, {
  requiredRoles: ["ADMIN"],
  requireCompletedOnboarding: true,
});
const ProfileRoute = lazyProtectedPage(ProfilePage, {
  requireCompletedOnboarding: true,
});

const TimelineRoute = lazyProtectedPage(TimelinePage, {
  permissions: ["reports:read"],
  requireCompletedOnboarding: true,
});

const AuditRoute = lazyProtectedPage(AuditPage, {
  requiredRoles: ["ADMIN"],
  requireCompletedOnboarding: true,
});

const BillingRoute = lazyProtectedPage(BillingPage, {
  permissions: ["settings:manage"],
  requireCompletedOnboarding: true,
});

const OperationalCockpitRoute = lazyProtectedPage(OperationalCockpitPage, {
  requiredRoles: ["ADMIN"],
  requireCompletedOnboarding: true,
});

function LegacyAliasRoute({
  targetPath,
  message,
}: {
  targetPath: string;
  message: string;
}) {
  const [location, navigate] = useLocation();

  useEffect(() => {
    const query = location.includes("?")
      ? location.slice(location.indexOf("?"))
      : "";
    navigate(`${targetPath}${query}`, { replace: true });
  }, [location, navigate, targetPath]);

  return <RedirectingScreen message={message} />;
}

function Router() {
  const [location] = useLocation();
  const { authState, isAuthenticated } = useAuth();
  const pathname = extractPathname(location);

  bootLog("[ROUTER] enter", { route: location, pathname, authState, isAuthenticated });
  setBootPhase("ROUTER_INIT");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const appPrefixes = [
      "/executive-dashboard",
      "/customers",
      "/appointments",
      "/service-orders",
      "/finances",
      "/people",
      "/governance",
      "/whatsapp",
      "/calendar",
      "/settings",
      "/timeline",
      "/audit",
      "/billing",
      "/cockpit",
      "/onboarding",
    ];
    const isAppRoute = appPrefixes.some(
      prefix => location === prefix || location.startsWith(`${prefix}/`)
    );
    document.body.dataset.visualContext = isAppRoute ? "app" : "landing";
    document.documentElement.dataset.visualContext = isAppRoute
      ? "app"
      : "landing";

  }, [location]);

  useEffect(() => {
    setBootPhase(`APP_PAGE:${location}`);
  }, [location]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[ROUTER] pathname", { pathname, location });
  }, [location, pathname]);

  return (
    <Switch>
      <Route path="/">
        <RootRoute />
      </Route>

      <Route path="/login">{authPage(Login)()}</Route>

      <Route path="/register" component={directAuthPage(RegisterPage)} />

      <Route path="/forgot-password">{authPage(ForgotPasswordPage)()}</Route>

      <Route path="/reset-password">{authPage(ResetPasswordPage)()}</Route>

      <Route path="/auth/accept-invite">{authPage(AcceptInvitePage)()}</Route>

      <Route path="/auth/callback">{authPage(AuthCallbackPage)()}</Route>

      <Route path="/auth/confirm-email">{authPage(ConfirmEmailPage)()}</Route>

      <Route path="/onboarding">{onboardingPage(Onboarding)()}</Route>

      <Route
        path="/dashboard"
        component={() => (
          <LegacyAliasRoute
            targetPath="/executive-dashboard"
            message="Dashboard executivo oficial em /executive-dashboard. Redirecionando..."
          />
        )}
      />
      <Route path="/customers" component={CustomersRoute} />
      <Route path="/appointments" component={AppointmentsRoute} />
      <Route path="/service-orders" component={ServiceOrdersRoute} />
      <Route
        path="/finance"
        component={() => (
          <LegacyAliasRoute
            targetPath="/finances"
            message="Finance foi consolidado em Financeiro. Redirecionando..."
          />
        )}
      />
      <Route path="/finances" component={FinancesRoute} />
      <Route path="/people" component={PeopleRoute} />
      <Route path="/governance" component={GovernanceRoute} />
      <Route path="/executive-dashboard" component={ExecutiveDashboardRoute} />
      <Route
        path="/executive-dashboard-new"
        component={() => (
          <LegacyAliasRoute
            targetPath="/executive-dashboard"
            message="Versão consolidada no dashboard executivo oficial. Redirecionando..."
          />
        )}
      />
      <Route path="/whatsapp/webhooks" component={WhatsAppWebhookRecoveryRoute} />
      <Route path="/whatsapp" component={WhatsAppRoute} />
      <Route
        path="/launches"
        component={() => (
          <LegacyAliasRoute
            targetPath="/finances"
            message="Lançamentos foram consolidados em Financeiro. Redirecionando..."
          />
        )}
      />
      <Route
        path="/invoices"
        component={() => (
          <LegacyAliasRoute
            targetPath="/finances"
            message="Faturas foram consolidadas em Financeiro. Redirecionando..."
          />
        )}
      />
      <Route
        path="/expenses"
        component={() => (
          <LegacyAliasRoute
            targetPath="/finances"
            message="Despesas foram consolidadas em Financeiro. Redirecionando..."
          />
        )}
      />
      <Route
        path="/referrals"
        component={() => (
          <LegacyAliasRoute
            targetPath="/customers"
            message="Indicações foram consolidadas em Clientes. Redirecionando..."
          />
        )}
      />
      <Route path="/calendar" component={CalendarRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="/profile" component={ProfileRoute} />
      <Route path="/timeline" component={TimelineRoute} />
      <Route path="/audit" component={AuditRoute} />
      <Route path="/billing" component={BillingRoute} />
      <Route path="/cockpit/operations" component={OperationalCockpitRoute} />
      <Route
        path="/operations"
        component={() => (
          <LegacyAliasRoute
            targetPath="/service-orders"
            message="Workflow legado consolidado em Ordens de Serviço. Redirecionando..."
          />
        )}
      />
      <Route
        path="/dashboard/operations"
        component={() => (
          <LegacyAliasRoute
            targetPath="/service-orders"
            message="Operações foram consolidadas em Ordens de Serviço. Redirecionando..."
          />
        )}
      />

      <Route path="/about" component={publicPage(About)} />
      <Route path="/sobre" component={publicPage(About)} />
      <Route path="/produto" component={publicPage(ProductPage)} />
      <Route path="/precos" component={publicPage(PricingPage)} />
      <Route
        path="/funcionalidades"
        component={publicPage(FunctionalitiesPage)}
      />
      <Route path="/contato" component={publicPage(ContactPage)} />
      <Route path="/privacy" component={publicPage(PrivacyPolicy)} />
      <Route path="/privacidade" component={publicPage(PrivacyPolicy)} />
      <Route path="/terms" component={publicPage(TermsOfService)} />
      <Route path="/termos" component={publicPage(TermsOfService)} />
      <Route path="/404" component={() => <LazyPage component={NotFound} />} />
      <Route component={() => <LazyPage component={NotFound} />} />
    </Switch>
  );
}


export type RootRouteBranch =
  | "initializing_landing"
  | "bootstrap_error_landing"
  | "unauthenticated_landing"
  | "authenticated_redirect"
  | "unknown_state_fallback";

export function resolveRootRouteBranch(authState: unknown): RootRouteBranch {
  if (authState === "validating") return "initializing_landing";
  if (authState === "error") return "bootstrap_error_landing";
  if (authState === "unauthenticated") return "unauthenticated_landing";
  if (authState === "authenticated") return "authenticated_redirect";
  return "unknown_state_fallback";
}

function RootRoute() {
  const { authState, bootstrapError, payload } = useAuth();
  const [location, navigate] = useLocation();
  const pathname = extractPathname(location);
  const rootBranch = resolveRootRouteBranch(authState);

  useEffect(() => {
    setAuditField("rootBranch", rootBranch);
    pushAuditEvent("root", "branch", { pathname, rootBranch, authState });
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[ROOT] branch", {
      at: new Date().toISOString(),
      pathname,
      location,
      readyState: typeof document !== "undefined" ? document.readyState : "unknown",
      title: typeof document !== "undefined" ? document.title : "unknown",
      authState,
      branch: rootBranch,
    });
  }, [authState, location, pathname, rootBranch]);

  useEffect(() => {
    bootLog("[ROUTER] root_route_state", {
      route: location,
      authState,
      branch:
        authState === "validating"
          ? "loading"
          : authState === "error"
            ? "error"
            : authState === "unauthenticated"
              ? "landing"
              : "redirect",
    });
    if (rootBranch === "initializing_landing") {
      bootLog("[AUTH] initializing");
      return;
    }
    if (rootBranch === "bootstrap_error_landing") {
      bootError("[BOOT ERROR] auth bootstrap", bootstrapError);
      return;
    }
    if (rootBranch === "unauthenticated_landing") return;
    if (rootBranch === "unknown_state_fallback") {
      bootError("[ROOT] unexpected auth state", { authState, pathname });
      setAuditField("errorType", "route");
      return;
    }

    const requiresOnboarding = getRequiresOnboarding(payload);
    const target = requiresOnboarding ? "/onboarding" : "/executive-dashboard";
    if (requiresOnboarding) {
      bootLog("[RENDER] onboarding");
    } else {
      bootLog("[RENDER] app");
    }
    bootLog("[ROUTER] redirect", { target });
    navigate(target, { replace: true });
  }, [authState, bootstrapError, location, navigate, payload]);

  if (rootBranch === "initializing_landing") {
    bootLog("[ROUTER] root_render", {
      route: pathname,
      branch: "initializing_landing",
      landingRendered: true,
    });
    return (
      <>
        <RenderAuditMarker label="ROOT BRANCH: initializing_landing" />
        <MarketingRoute component={Landing} />
        <AuthRouteLoader />
      </>
    );
  }

  if (rootBranch === "bootstrap_error_landing") {
    bootLog("[ROUTER] root_render", {
      route: pathname,
      branch: "bootstrap_error_landing",
      landingRendered: true,
    });
    return (
      <>
        <RenderAuditMarker label="ROOT BRANCH: bootstrap_error_landing" />
        <MarketingRoute component={Landing} />
      </>
    );
  }

  if (rootBranch === "unauthenticated_landing") {
    bootLog("[ROUTER] root_render", {
      route: pathname,
      branch: "unauthenticated_landing",
      landingRendered: true,
    });
    return (
      <>
        <RenderAuditMarker label="ROOT BRANCH: unauthenticated_landing" />
        <MarketingRoute component={Landing} />
      </>
    );
  }

  if (rootBranch === "authenticated_redirect") {
    bootLog("[ROUTER] root_render", {
      route: pathname,
      branch: "authenticated_redirect",
      landingRendered: false,
    });
    return (
      <>
        <RenderAuditMarker label="ROOT BRANCH: authenticated_redirect" />
        <RedirectingScreen message="Redirecionando para o ambiente interno..." />
      </>
    );
  }

  bootError("[ROOT] fallback visual acionado", {
    pathname,
    authState,
  });

  return (
    <>
      <RenderAuditMarker label="ROOT BRANCH: unknown_state_fallback" />
      <FullScreenMessage
        title="Fallback RootRoute"
        description="Estado inesperado de roteamento detectado. Atualize a página para continuar."
        actionLabel="Recarregar aplicação"
        onAction={() => {
          if (typeof window === "undefined") return;
          window.location.reload();
        }}
      />
    </>
  );
}

function App() {
  bootLog("[APP] render");
  if (import.meta.env.DEV && typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.info("[APP] render details", {
      at: new Date().toISOString(),
      pathname: window.location.pathname,
      readyState: document.readyState,
    });
  }
  setBootPhase("AUTH_INIT");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAuditField("appMountedAt", new Date().toISOString());
      pushAuditEvent("app", "mounted", { pathname: window.location.pathname });
      window.dispatchEvent(new CustomEvent("nexo:app-mounted"));
    }
    // eslint-disable-next-line no-console
    console.log("[APP] mounted");
    return () => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[APP] unmount");
      }
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      // eslint-disable-next-line no-console
      console.info("[APP] first paint reached", {
        at: new Date().toISOString(),
        pathname: window.location.pathname,
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const [bootstrapState, setBootstrapState] = useState<AppBootstrapState>("validating");
  const [bootstrapReason, setBootstrapReason] = useState<string | undefined>(undefined);
  const bootProbeStage = useMemo<BootProbeStage>(() => {
    if (typeof window === "undefined") return "full";
    const value = new URLSearchParams(window.location.search)
      .get("bootProbe")
      ?.trim()
      .toLowerCase();

    if (value === "static") return "static";
    if (value === "router") return "router";
    if (value === "auth") return "auth";
    if (value === "layout") return "layout";
    if (value === "execution-bar") return "execution-bar";
    if (value === "global-engine") return "global-engine";

    // Probes de main.tsx para isolar providers não devem executar o App real.
    // Mantemos esses aliases apontando para a sonda estática para validar apenas
    // a camada de bootstrap/provider sem router/auth/layout.
    if (
      value === "providers-none" ||
      value === "providers-query-only" ||
      value === "providers-trpc-only"
    ) {
      return "static";
    }

    return "full";
  }, []);

  useEffect(() => {
    bootLog("[BOOTSTRAP] app init", { bootProbeStage });
    setAuditField("bootstrapBranch", bootProbeStage);
    pushAuditEvent("bootstrap", "boot-probe-stage", { bootProbeStage });
  }, []);

  const bootProbeLabel = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("bootProbe")?.trim() || null;
  }, []);

  const markReady = useCallback((nextState: "authenticated" | "unauthenticated") => {
    setBootstrapState(prev => {
      if (prev === nextState) return prev;
      bootLog("[BOOT] providers ready");
      setAuditField("bootstrapBranch", `ready:${nextState}`);
      return nextState;
    });
  }, []);

  const markFailed = useCallback((reason: string) => {
    setBootstrapReason(reason);
    setBootstrapState("error");
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[BOOT ERROR] bootstrap state failed", { reason });
    }
    setAuditField("errorType", "bootstrap");
    pushAuditEvent("bootstrap", "failed", { reason });
  }, []);

  const reloadApp = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.reload();
  }, []);

  if (bootProbeStage === "static") {
    return <div>NEXO OK{bootProbeLabel ? ` · probe=${bootProbeLabel}` : ""}</div>;
  }

  if (bootProbeStage === "router") {
    return (
      <AppErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/">
              <div>NEXO ROUTER OK</div>
            </Route>
          </Switch>
        </TooltipProvider>
      </AppErrorBoundary>
    );
  }

  const appContent =
    bootProbeStage === "auth" ? (
      <TooltipProvider>
        <Toaster />
        <AuthProbeScreen />
      </TooltipProvider>
    ) : bootProbeStage === "layout" ||
      bootProbeStage === "execution-bar" ||
      bootProbeStage === "global-engine" ? (
      <BootProbeProvider stage={bootProbeStage}>
        <TooltipProvider>
          <Toaster />
          <AppLayout>
            <div className="p-4 text-sm text-[var(--text-secondary)]">
              NEXO LAYOUT OK
            </div>
          </AppLayout>
          <ConsentBanner />
        </TooltipProvider>
      </BootProbeProvider>
    ) : (
      <BootProbeProvider stage={bootProbeStage}>
        <TooltipProvider>
          <Toaster />
          <Router />
          <ConsentBanner />
        </TooltipProvider>
      </BootProbeProvider>
    );

  if (!appContent) {
    return (
      <FullScreenMessage
        title="Fallback App"
        description="Falha inesperada ao montar a aplicação."
      />
    );
  }

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AuthBootstrapStatus onReady={markReady} onFailed={markFailed} />
        <AppBootstrapGuard state={bootstrapState} reason={bootstrapReason} onReload={reloadApp}>
          <RenderAuditMarker label="APP RENDER OK" />
          {appContent}
        </AppBootstrapGuard>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

function AuthBootstrapStatus({
  onReady,
  onFailed,
}: {
  onReady: (state: "authenticated" | "unauthenticated") => void;
  onFailed: (reason: string) => void;
}) {
  const { authState, bootstrapError } = useAuth();
  const [location] = useLocation();
  const pathname = extractPathname(location);
  const isPublicRoute = isPublicOrAuthPath(pathname);

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[BOOTSTRAP] state", { authState });
    }
    if (authState === "validating") return;
    if (authState === "error") {
      if (isPublicRoute) {
        setBootPhase("AUTH_UNAUTHENTICATED");
        onReady("unauthenticated");
        return;
      }

      setBootPhase("AUTH_ERROR");
      onFailed(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Falha ao inicializar autenticação"
      );
      return;
    }
    if (authState === "unauthenticated") {
      setBootPhase("AUTH_UNAUTHENTICATED");
      bootLog("[RENDER] login");
    }
    if (authState === "authenticated") {
      setBootPhase("AUTH_AUTHENTICATED");
      bootLog("[RENDER] app");
    }
    if (authState === "authenticated" || authState === "unauthenticated") {
      onReady(authState);
      return;
    }
    onFailed("Estado de autenticação inesperado durante bootstrap");
  }, [authState, bootstrapError, isPublicRoute, onFailed, onReady]);

  return null;
}

function AuthProbeScreen() {
  const { isInitializing, isAuthenticated, user, authState } = useAuth();

  return (
    <div className="p-4 text-sm text-[var(--text-secondary)]">
      AUTH OK · state={authState} · init={String(isInitializing)} · auth={String(isAuthenticated)} ·
      user={user?.id ?? "none"}
    </div>
  );
}

export default App;
