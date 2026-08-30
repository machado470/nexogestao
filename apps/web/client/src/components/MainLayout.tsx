import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  History,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { canAny, type Permission, type Role } from "@/lib/rbac";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { GlobalSearch } from "@/components/GlobalSearch";
import { BrandSignature } from "@/components/BrandSignature";
import { AppShell } from "@/components/AppShell";
import { useOperationalMemoryState } from "@/hooks/useOperationalMemory";
import { cn } from "@/lib/utils";
import { isSafeNotificationRouteHint } from "../../../../../packages/common/src/notification-route";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuItem = {
  id: string;
  label: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions?: Permission[];
  requiredRoles?: Role[];
};

type MenuSection = {
  id: string;
  label: string;
  items: MenuItem[];
};

function isRouteActive(location: string, route: string) {
  return location === route || location.startsWith(`${route}/`);
}

interface MainLayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "nexo:app-shell:sidebar-collapsed";
const SIDEBAR_EXPANDED_WIDTH = 292;
const SIDEBAR_COLLAPSED_WIDTH = 88;

export function MainLayout({ children }: MainLayoutProps) {
  // KPI/top-metrics são definidos por página (dashboard forte, módulos contextuais).
  // O layout principal não deve injetar cards globais para evitar regressão estrutural.
  const [location, navigate] = useLocation();
  const { role, user, logout, isLoggingOut, loading, isAuthenticated } =
    useAuth();
  const { theme, toggleTheme } = useTheme();
  const trpcUtils = trpc.useUtils();
  const notificationQuery = trpc.dashboard.notificationCenter.list.useQuery(
    { page: 1, limit: 6, category: "all" },
    { enabled: isAuthenticated, retry: false },
  );
  const markNotificationRead = trpc.dashboard.notificationCenter.markAsRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        trpcUtils.dashboard.notificationCenter.list.invalidate(),
        trpcUtils.dashboard.notificationCenter.unreadCount.invalidate(),
        trpcUtils.dashboard.notifications.invalidate(),
      ]);
    },
  });
  const persistentNotifications = notificationQuery.data?.items ?? [];
  const unreadCount = notificationQuery.data?.unreadCount;
  const notificationStreamStatus = useNotificationStream(isAuthenticated, () => {
    void Promise.all([
      trpcUtils.dashboard.notificationCenter.list.invalidate(),
      trpcUtils.dashboard.notificationCenter.unreadCount.invalidate(),
      trpcUtils.dashboard.notifications.invalidate(),
    ]);
  });

  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] =
    useOperationalMemoryState<boolean>(SIDEBAR_COLLAPSED_STORAGE_KEY, true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (import.meta.env.DEV && import.meta.env.VITE_BOOT_DIAGNOSTICS === "true") {
    // eslint-disable-next-line no-console
    console.info("[LAYOUT] MainLayout mounted", {
      pathname: location,
      hasChildren: Boolean(children),
      loading,
      isAuthenticated,
      userId: user?.id ?? null,
    });
  }

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      import.meta.env.VITE_BOOT_DIAGNOSTICS !== "true"
    )
      return;
    // eslint-disable-next-line no-console
    console.log("[boot] MainLayout mounted");
    return () => {
      // eslint-disable-next-line no-console
      console.log("[boot] MainLayout unmounted");
    };
  }, []);

  const sections: MenuSection[] = [
    {
      id: "operacao",
      label: "Operação",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          route: "/executive-dashboard",
          icon: LayoutDashboard,
        },
        {
          id: "customers",
          label: "Clientes",
          route: "/customers",
          icon: Users,
          permissions: ["customers:read"],
        },
        {
          id: "appointments",
          label: "Agendamentos",
          route: "/appointments",
          icon: Calendar,
          permissions: ["appointments:read"],
        },
        {
          id: "service-orders",
          label: "Ordens de Serviço",
          route: "/service-orders",
          icon: Briefcase,
          permissions: ["orders:read"],
        },
      ],
    },
    {
      id: "controle",
      label: "Controle",
      items: [
        {
          id: "finances",
          label: "Financeiro",
          route: "/finances",
          icon: DollarSign,
          permissions: ["finance:read"],
        },
        {
          id: "whatsapp",
          label: "WhatsApp",
          route: "/whatsapp",
          icon: MessageCircle,
        },
        {
          id: "timeline",
          label: "Timeline",
          route: "/timeline",
          icon: History,
          permissions: ["reports:read"],
        },
      ],
    },
    {
      id: "inteligencia",
      label: "Inteligência",
      items: [
        {
          id: "calendar",
          label: "Calendário",
          route: "/calendar",
          icon: CalendarDays,
          permissions: ["appointments:read"],
        },
        {
          id: "governance",
          label: "Governança",
          route: "/governance",
          icon: Shield,
          permissions: ["governance:read"],
        },
        {
          id: "people",
          label: "Pessoas",
          route: "/people",
          icon: Building2,
          permissions: ["people:manage"],
        },
      ],
    },
    {
      id: "sistema",
      label: "Sistema",
      items: [
        {
          id: "billing",
          label: "Planos",
          route: "/billing",
          icon: CreditCard,
          permissions: ["settings:manage"],
        },
        {
          id: "audit",
          label: "Auditoria",
          route: "/audit",
          icon: ClipboardList,
          requiredRoles: ["ADMIN"],
        },
        {
          id: "profile",
          label: "Perfil",
          route: "/profile",
          icon: User,
        },
        {
          id: "settings",
          label: "Configurações",
          route: "/settings",
          icon: Settings,
        },
      ],
    },
  ];

  const visibleSections = useMemo(
    () =>
      sections
        .map(section => ({
          ...section,
          items: section.items.filter(item => {
            if (
              item.requiredRoles?.length &&
              (!role || !item.requiredRoles.includes(role))
            )
              return false;
            if (!item.permissions?.length) return true;
            if (!role) return false;
            return canAny(role, item.permissions);
          }),
        }))
        .filter(section => section.items.length > 0),
    [role]
  );

  const isWhatsAppRoute = isRouteActive(location, "/whatsapp");
  const desktopSidebarWidth = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_EXPANDED_WIDTH;
  const isDesktopCollapsedSidebar = sidebarCollapsed && !isMobile;

  useEffect(() => {
    if (!isMobile) return;
    setMobileMenuOpen(false);
  }, [isMobile, location]);

  const handleNavigate = (route: string) => {
    navigate(route);
    if (isMobile) setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await Promise.race([
        logout(),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error("logout-timeout")), 5000)
        ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "logout-timeout") {
        window.location.replace(`/login?logoutFallback=${Date.now()}`);
        return;
      }

      toast.error(
        error instanceof Error ? error.message : "Falha ao encerrar sessão."
      );
    }
  };

  return (
    <AppShell>
      <div
        className={`nexo-app-shell nexo-app app-root ${theme === "dark" ? "dark" : ""} min-h-screen text-[var(--text-primary)]`}
        data-theme={theme}
      >
        {isMobile && mobileMenuOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--background-base)_84%,black)]/70 backdrop-blur-sm nexo-state-transition"
            onClick={() => setMobileMenuOpen(false)}
          />
        ) : null}
        {!isMobile && !sidebarCollapsed ? (
          <button
            type="button"
            aria-label="Recolher menu lateral"
            className="fixed inset-0 z-30 bg-slate-950/20 nexo-state-transition"
            onClick={() => setSidebarCollapsed(true)}
          />
        ) : null}

        <div className="flex min-h-screen w-full">
          <aside
            data-scrollbar="nexo"
            className={`nexo-sidebar z-40 flex shrink-0 flex-col overflow-hidden shadow-lg transition-[width,transform] duration-200 ease-out ${
              isMobile
                ? `fixed inset-y-0 left-0 w-[304px] ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`
                : "fixed inset-y-0 left-0"
            }`}
            style={{
              width: !isMobile ? `${desktopSidebarWidth}px` : undefined,
              backgroundColor: "var(--app-sidebar-surface, var(--app-sidebar))",
            }}
          >
            <div
              className={`nexo-sidebar-header border-b border-[var(--border)] py-2 ${
                isDesktopCollapsedSidebar ? "px-2" : "px-3.5"
              }`}
            >
              <div
                className={`flex items-center gap-2 ${
                  isDesktopCollapsedSidebar
                    ? "relative min-h-10 justify-start pl-1 pr-11"
                    : "justify-between"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleNavigate("/executive-dashboard")}
                  className={`flex min-w-0 items-center ${
                    isDesktopCollapsedSidebar ? "justify-start" : ""
                  }`}
                >
                  <BrandSignature compact={isDesktopCollapsedSidebar} />
                </button>

                {!isMobile ? (
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(prev => !prev)}
                    aria-label={
                      sidebarCollapsed
                        ? "Expandir menu lateral"
                        : "Recolher menu lateral"
                    }
                    title={
                      sidebarCollapsed
                        ? "Expandir menu lateral"
                        : "Recolher menu lateral"
                    }
                    className={`rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/35 ${
                      isDesktopCollapsedSidebar
                        ? "absolute right-1.5 top-1/2 -translate-y-1/2"
                        : ""
                    }`}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/35"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
              <div className="space-y-5">
                {visibleSections.map(section => (
                  <section key={section.id} className="space-y-2">
                    {!sidebarCollapsed || isMobile ? (
                      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
                        {section.label}
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      {section.items.map(item => {
                        const active = isRouteActive(location, item.route);
                        const Icon = item.icon;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.label}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                            onClick={() => handleNavigate(item.route)}
                            className={`nexo-sidebar-item group nexo-state-transition ${active ? "nexo-sidebar-item-active" : ""} ${
                              sidebarCollapsed && !isMobile
                                ? "h-11 justify-center px-0"
                                : ""
                            }`}
                          >
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                active
                                  ? "text-[var(--text-primary)]"
                                  : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                              }`}
                            />
                            {!sidebarCollapsed || isMobile ? (
                              <span className="truncate text-sm font-medium">
                                {item.label}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </nav>

            <div className="border-t border-[var(--border)] p-3">
              <button
                type="button"
                onClick={toggleTheme}
                title={
                  theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
                }
                aria-label={
                  theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
                }
                className={`nexo-sidebar-item w-full ${sidebarCollapsed && !isMobile ? "h-11 justify-center px-0" : ""}`}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {!sidebarCollapsed || isMobile ? (
                  <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
                ) : null}
              </button>
            </div>
          </aside>

          <div
            data-sidebar-collapsed={
              !isMobile && sidebarCollapsed ? "true" : "false"
            }
            data-sidebar-expanded={
              !isMobile && !sidebarCollapsed ? "true" : "false"
            }
            className="flex min-w-0 flex-1 flex-col"
            style={
              !isMobile
                ? { marginLeft: "var(--sidebar-collapsed-width, 88px)" }
                : undefined
            }
          >
            <header className="nexo-topbar z-20 nexo-state-transition">
              <div className="nexo-topbar-grid">
                <div className="nexo-topbar-content-grid">
                  <div className="flex min-w-0 items-center gap-2 md:gap-2.5">
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => setMobileMenuOpen(prev => !prev)}
                        className="nexo-topbar-control"
                      >
                        <Menu className="h-5 w-5" />
                      </button>
                    ) : null}
                    <div className="nexo-topbar-search-slot min-w-0 self-center">
                      <GlobalSearch />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 md:gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="nexo-topbar-control relative"
                          aria-label="Notificações"
                        >
                          <Bell className="h-4 w-4" />
                          {typeof unreadCount === "number" && unreadCount > 0 ? (
                            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--text-primary)]">
                              {Math.min(unreadCount, 9)}
                            </span>
                          ) : null}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-[360px] nexo-floating-panel"
                      >
                        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2">
                          <span>Notificações</span>
                          <span className="text-xs font-normal text-[var(--text-muted)]">
                            {notificationStreamStatus === "connected" ? "Atualização em tempo real ativa" :
                              notificationStreamStatus === "reconnecting" || notificationStreamStatus === "connecting" ? "Reconectando atualizações…" :
                                "Dados disponíveis por consulta"}
                          </span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {notificationQuery.isLoading ? (
                          <div className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">Carregando notificações…</div>
                        ) : notificationQuery.isError ? (
                          <div className="px-3 py-8 text-center">
                            <p className="text-sm text-[var(--danger)]">Não foi possível carregar as notificações.</p>
                            <button type="button" onClick={() => notificationQuery.refetch()} className="mt-2 text-xs font-medium text-[var(--accent)]">Tentar novamente</button>
                          </div>
                        ) : persistentNotifications.length === 0 ? (
                          <div className="px-3 py-8 text-center">
                            <Bell className="mx-auto h-5 w-5 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm text-[var(--text-muted)]">Nenhuma notificação no momento.</p>
                          </div>
                        ) : persistentNotifications.map(item => {
                          const safeRouteHint = isSafeNotificationRouteHint(item.routeHint) ? item.routeHint : null;
                          return (
                          <DropdownMenuItem
                            key={item.id}
                            className={cn("flex flex-col items-start gap-1 rounded-xl px-3 py-2", safeRouteHint && "cursor-pointer", !item.read && "bg-[var(--surface-subtle)]")}
                            onSelect={evt => {
                              evt.preventDefault();
                              if (!item.read) markNotificationRead.mutate({ id: item.id });
                              if (safeRouteHint) navigate(safeRouteHint);
                            }}
                          >
                            <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                            <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{item.message}</p>
                          </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="nexo-topbar-control h-9 px-2.5"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--text-primary)]">
                            <User className="h-4 w-4" />
                          </div>
                          <span className="hidden max-w-28 truncate md:block">
                            {user?.name ?? "Usuário"}
                          </span>
                          <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 p-1">
                        <DropdownMenuLabel className="px-2 py-1.5">
                          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                            {user?.name ?? "Usuário"}
                          </p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {user?.email ?? "Sem e-mail"}
                          </p>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="h-8 rounded-md px-2 text-sm text-[var(--text-secondary)] focus:text-[var(--text-primary)]"
                          onClick={() => navigate("/profile")}
                        >
                          <User className="mr-2 h-4 w-4" /> Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="h-8 rounded-md px-2 text-sm text-[var(--text-secondary)] focus:text-[var(--text-primary)]"
                          onClick={toggleTheme}
                        >
                          {theme === "dark" ? (
                            <Sun className="mr-2 h-4 w-4" />
                          ) : (
                            <Moon className="mr-2 h-4 w-4" />
                          )}{" "}
                          Tema
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void handleLogout()}
                          disabled={isLoggingOut}
                          className="h-8 rounded-md px-2 text-sm text-[var(--danger)] focus:text-[var(--danger)]"
                        >
                          <LogOut className="mr-2 h-4 w-4" /> Sair
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </header>

            <main
              data-scrollbar="nexo"
              className={cn(
                "nexo-app-content nexo-section-reveal mt-0 min-h-0 flex-1 overflow-auto px-3 pb-4 md:mt-0 md:px-4 md:pb-5",
                isWhatsAppRoute
                  ? "mt-0 overflow-hidden px-3 pb-0 pt-0 md:mt-0 md:px-4 md:pb-0"
                  : undefined
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
