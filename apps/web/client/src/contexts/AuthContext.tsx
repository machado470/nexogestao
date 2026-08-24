import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { normalizeRole, type Role } from "@/lib/rbac";
import {
  extractPathname,
  shouldBootstrapSessionForPath,
} from "@/lib/routeAccess";
import { pushAuditEvent, setAuditField } from "@/lib/renderAudit";

type AuthUser = {
  token?: string;
  id?: string;
  organizationId?: string;
  role?: string;
  email?: string;
  name?: string;
  normalizedRole: Role | null;
} | null;

export type AuthBootstrapState =
  | "validating"
  | "unauthenticated"
  | "authenticated"
  | "degraded"
  | "error";

export function resolveAuthBootstrapState(params: {
  isInitializing: boolean;
  bootstrapError: unknown | null;
  user: AuthUser;
  isUnavailable?: boolean;
}): AuthBootstrapState {
  if (params.isInitializing) return "validating";
  if (params.isUnavailable) return "degraded";
  if (params.bootstrapError) return "error";
  if (params.user) return "authenticated";
  return "unauthenticated";
}

interface AuthContextType {
  user: AuthUser;
  loading: boolean;
  isInitializing: boolean;
  isSubmitting: boolean;
  isAuthenticating: boolean;
  isLoggingOut: boolean;
  error: unknown | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    orgName: string;
    adminName: string;
    email: string;
    password: string;
  }) => Promise<any>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  payload: unknown;
  redirectTo: string;
  role: Role | null;
  authState: AuthBootstrapState;
  bootstrapError: unknown | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const APP_STORAGE_PREFIXES = ["nexo:", "nexogestao_", "pilot-onboarding:"];
/* =========================
   HELPERS
========================= */

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

function getUser(payload: unknown) {
  const env = getEnvelope(payload);
  if (!env) return null;

  const raw = (env.user ?? env) as Record<string, unknown>;

  if (!isObject(raw)) return null;

  const normalizeIdentifier = (value: unknown): string | undefined => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  };

  return {
    token: raw.token as string | undefined,
    id: normalizeIdentifier(raw.id),
    organizationId: normalizeIdentifier(raw.organizationId ?? raw.orgId),
    role: raw.role as string | undefined,
    email: raw.email as string | undefined,
    name: raw.name as string | undefined,
  };
}

function getRedirect(payload: unknown): string {
  const env = getEnvelope(payload);
  return (env?.redirect as string) || "/executive-dashboard";
}

function redirectToLogin() {
  try {
    if (typeof window === "undefined") return;
    window.location.replace(`/login?logoutAt=${Date.now()}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[AUTH] redirect failed", error);
  }
}

function clearAppStorage() {
  try {
    if (typeof window === "undefined") return;

    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (APP_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }

    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      if (APP_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[AUTH] clear storage failed", error);
  }
}

function createSafeBroadcastChannel(name: string) {
  try {
    if (typeof window === "undefined") return null;
    if (!("BroadcastChannel" in window)) return null;
    return new BroadcastChannel(name);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[AUTH] BroadcastChannel unavailable", err);
    return null;
  }
}

export function isExpectedUnauthenticatedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    data?: { code?: unknown; httpStatus?: unknown };
    shape?: { data?: { code?: unknown; httpStatus?: unknown } };
    message?: unknown;
  };

  const code =
    maybeError.data?.code ??
    maybeError.shape?.data?.code ??
    (typeof maybeError.message === "string" ? maybeError.message : null);
  const httpStatus =
    maybeError.data?.httpStatus ?? maybeError.shape?.data?.httpStatus;

  if (httpStatus === 401) return true;
  if (code === "UNAUTHORIZED") return true;
  if (typeof code === "string" && code.toLowerCase().includes("unauthorized")) {
    return true;
  }

  return false;
}

function isSessionUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    data?: { code?: unknown; httpStatus?: unknown };
    shape?: { data?: { code?: unknown; httpStatus?: unknown } };
    message?: unknown;
    cause?: { message?: unknown };
  };

  const code = maybeError.data?.code ?? maybeError.shape?.data?.code;
  const httpStatus =
    maybeError.data?.httpStatus ?? maybeError.shape?.data?.httpStatus;
  const message =
    typeof maybeError.message === "string" ? maybeError.message : "";
  const causeMessage =
    typeof maybeError.cause?.message === "string"
      ? maybeError.cause.message
      : "";

  if (code === "SERVICE_UNAVAILABLE") return true;
  if (httpStatus === 503) return true;
  if (message.includes("SESSION_UPSTREAM_UNAVAILABLE")) return true;
  if (causeMessage.includes("SESSION_UPSTREAM_UNAVAILABLE")) return true;

  return false;
}

/* ========================= */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<unknown | null>(null);
  const [forcedLoggedOut, setForcedLoggedOut] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pathname = useMemo(() => extractPathname(location), [location]);
  const previousAuthStateRef = useRef<AuthBootstrapState | null>(null);
  const meBootstrapStartedAtRef = useRef<number | null>(null);
  const lastUnavailableLogAtRef = useRef<number>(0);

  const shouldBootstrapSession = shouldBootstrapSessionForPath(pathname);
  const syncEventRef = useRef<(payload: unknown) => Promise<void>>(
    async () => {}
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setAuditField("pathname", pathname);
    pushAuditEvent("auth", "provider:mount", { pathname });
    // eslint-disable-next-line no-console
    console.info("[AUTH] AuthProvider mounted", { pathname });
    return () => {
      // eslint-disable-next-line no-console
      console.info("[AUTH] AuthProvider unmounted", { pathname });
    };
  }, [pathname]);

  const meQuery = trpc.session.me.useQuery(undefined, {
    enabled: shouldBootstrapSession && !forcedLoggedOut,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!shouldBootstrapSession || forcedLoggedOut) return;
    if (
      meQuery.fetchStatus === "fetching" &&
      meBootstrapStartedAtRef.current === null
    ) {
      meBootstrapStartedAtRef.current = Date.now();
      return;
    }

    if (meQuery.fetchStatus !== "idle" && meQuery.fetchStatus !== "paused")
      return;
    if (meBootstrapStartedAtRef.current === null) return;

    const durationMs = Date.now() - meBootstrapStartedAtRef.current;
    meBootstrapStartedAtRef.current = null;

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[PERF] session_me_bootstrap_ms", {
        durationMs,
        hasUser: Boolean(meQuery.data),
        hasError: Boolean(meQuery.error),
        pathname,
      });
    }
  }, [
    forcedLoggedOut,
    meQuery.data,
    meQuery.error,
    meQuery.fetchStatus,
    pathname,
    shouldBootstrapSession,
  ]);

  const loginMutation = trpc.nexo.auth.login.useMutation();
  const registerMutation = trpc.nexo.auth.register.useMutation();
  const logoutMutation = trpc.session.logout.useMutation();
  const isLoggingOut = logoutMutation.isPending;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (evt: StorageEvent) => {
      try {
        if (evt.key !== "nexo:auth:logout-at" || !evt.newValue) return;
        setForcedLoggedOut(true);
        queryClient.clear();
        redirectToLogin();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[AUTH] storage logout sync failed", err);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [queryClient]);

  useEffect(() => {
    channelRef.current = createSafeBroadcastChannel("nexo-auth");

    if (!channelRef.current) return;

    const handler = (event: MessageEvent) => {
      void syncEventRef.current(event?.data);
    };

    channelRef.current.addEventListener("message", handler);

    return () => {
      try {
        channelRef.current?.removeEventListener("message", handler);
        channelRef.current?.close();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[AUTH] failed to close BroadcastChannel", error);
      }
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (channelRef.current) return;

    const handler = (event: StorageEvent) => {
      if (event.key !== "nexo-auth-sync" || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        void syncEventRef.current(parsed);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[AUTH] storage sync parse failed", err);
      }
    };

    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, []);

  const emitAuthSync = useCallback((type: "login" | "logout") => {
    if (typeof window === "undefined") return;
    try {
      const payload = { type, at: Date.now() };
      if (channelRef.current) {
        channelRef.current.postMessage(payload);
        return;
      }
      window.localStorage.setItem("nexo-auth-sync", JSON.stringify(payload));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[AUTH] sync emit failed", err);
    }
  }, []);

  useEffect(() => {
    syncEventRef.current = async payload => {
      try {
        const type = String((payload as { type?: unknown })?.type ?? "");
        if (type === "logout") {
          setForcedLoggedOut(true);
          await utils.session.me.cancel();
          utils.session.me.setData(undefined, null);
          queryClient.clear();
          redirectToLogin();
          return;
        }

        if (type === "login") {
          setForcedLoggedOut(false);
          await utils.session.me.invalidate();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[AUTH] sync event failed", err);
      }
    };
  }, [queryClient, utils.session.me]);

  const refresh = useCallback(async () => {
    setLocalError(null);
    try {
      await utils.session.me.invalidate();
      await meQuery.refetch();
    } catch (error) {
      setLocalError(error);
      // eslint-disable-next-line no-console
      console.error("[AUTH] refresh failed", error);
      throw error;
    }
  }, [meQuery, utils]);

  const login = useCallback(
    async (email: string, password: string) => {
      setLocalLoading(true);
      setLocalError(null);

      try {
        await loginMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          password,
        });

        setForcedLoggedOut(false);
        queryClient.removeQueries();
        await meQuery.refetch();
        emitAuthSync("login");
      } catch (err) {
        setLocalError(err);
        throw err;
      } finally {
        setLocalLoading(false);
      }
    },
    [emitAuthSync, loginMutation, meQuery, queryClient]
  );

  const register = useCallback(
    async (payload: {
      orgName: string;
      adminName: string;
      email: string;
      password: string;
    }) => {
      setLocalLoading(true);
      setLocalError(null);

      try {
        const result = await registerMutation.mutateAsync({
          orgName: payload.orgName.trim(),
          adminName: payload.adminName.trim(),
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
        });

        const token =
          result?.data?.data?.token ??
          result?.data?.token ??
          result?.token ??
          result?.accessToken ??
          null;

        if (typeof token === "string" && token.trim().length > 0) {
          setForcedLoggedOut(false);
          queryClient.removeQueries();
          await meQuery.refetch();
          emitAuthSync("login");
        }

        return result;
      } catch (err) {
        setLocalError(err);
        throw err;
      } finally {
        setLocalLoading(false);
      }
    },
    [emitAuthSync, registerMutation, meQuery, queryClient]
  );

  const logout = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    setForcedLoggedOut(true);

    try {
      if (typeof window !== "undefined") {
        clearAppStorage();
        window.localStorage.setItem("nexo:auth:logout-at", String(Date.now()));
      }
      emitAuthSync("logout");
      await utils.session.me.cancel();
      utils.session.me.setData(undefined, null);
      await logoutMutation.mutateAsync();
      await utils.session.me.invalidate();
      queryClient.clear();

      redirectToLogin();
    } catch (err) {
      setLocalError(err);
      // eslint-disable-next-line no-console
      console.error("[AUTH] logout failed; forcing login redirect", err);
      redirectToLogin();
    } finally {
      setLocalLoading(false);
    }
  }, [emitAuthSync, logoutMutation, queryClient, utils]);

  const payload =
    forcedLoggedOut || !shouldBootstrapSession ? null : (meQuery.data ?? null);

  const user: AuthUser = useMemo(() => {
    const raw = getUser(payload);
    if (!raw) return null;

    return {
      ...raw,
      normalizedRole: normalizeRole(raw.role),
    };
  }, [payload]);

  const role = user?.normalizedRole ?? null;
  const redirectTo = useMemo(() => getRedirect(payload), [payload]);

  const isAuthenticating =
    localLoading || loginMutation.isPending || registerMutation.isPending;

  const isSubmitting = isAuthenticating;
  const meBootstrapError =
    shouldBootstrapSession &&
    !isExpectedUnauthenticatedError(meQuery.error) &&
    !isSessionUnavailableError(meQuery.error)
      ? meQuery.error
      : null;
  const meBootstrapUnavailable =
    shouldBootstrapSession && isSessionUnavailableError(meQuery.error);

  const isInitializing =
    shouldBootstrapSession &&
    !forcedLoggedOut &&
    meQuery.isLoading &&
    meQuery.data === undefined &&
    !isLoggingOut;

  const loading = isInitializing || isSubmitting;
  const userSafe = user ?? null;
  const isReady = !loading;
  const authState = resolveAuthBootstrapState({
    isInitializing,
    bootstrapError: meBootstrapError,
    user: userSafe,
    isUnavailable: meBootstrapUnavailable,
  });

  useEffect(() => {
    if (!meBootstrapUnavailable) return;
    const now = Date.now();
    if (now - lastUnavailableLogAtRef.current < 10_000) return;
    lastUnavailableLogAtRef.current = now;
    // eslint-disable-next-line no-console
    console.warn(
      "[AUTH] session bootstrap degraded due to /me unavailability",
      {
        pathname,
        fetchStatus: meQuery.fetchStatus,
        fallbackAuthState: "degraded",
      }
    );
  }, [meBootstrapUnavailable, meQuery.fetchStatus, pathname, userSafe]);

  useEffect(() => {
    setAuditField("bootstrapBranch", `auth:${authState}`);
    pushAuditEvent("auth", "state", {
      pathname,
      authState,
      shouldBootstrapSession,
      isInitializing,
      hasUser: Boolean(userSafe),
    });
  }, [authState, isInitializing, pathname, shouldBootstrapSession, userSafe]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const prevState = previousAuthStateRef.current;
    if (prevState === authState) return;
    // eslint-disable-next-line no-console
    console.info("[AUTH] state_transition", {
      at: new Date().toISOString(),
      from: prevState,
      to: authState,
      pathname,
      readyState:
        typeof document !== "undefined" ? document.readyState : "unknown",
      shouldBootstrapSession,
      forcedLoggedOut,
      meFetchStatus: meQuery.fetchStatus,
      meHasData: meQuery.data !== undefined,
    });
    previousAuthStateRef.current = authState;
  }, [
    authState,
    forcedLoggedOut,
    meQuery.data,
    meQuery.fetchStatus,
    pathname,
    shouldBootstrapSession,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[AUTH] snapshot", {
      at: new Date().toISOString(),
      pathname,
      authState,
      isInitializing,
      isAuthenticated: Boolean(userSafe),
      shouldBootstrapSession,
      forcedLoggedOut,
      meFetchStatus: meQuery.fetchStatus,
    });
  }, [
    authState,
    forcedLoggedOut,
    isInitializing,
    meQuery.fetchStatus,
    pathname,
    shouldBootstrapSession,
    userSafe,
  ]);

  useEffect(() => {
    if (!shouldBootstrapSession || forcedLoggedOut || !import.meta.env.DEV)
      return;
    // eslint-disable-next-line no-console
    console.info("[AUTH] init", { pathname });
  }, [forcedLoggedOut, pathname, shouldBootstrapSession]);

  if (import.meta.env.DEV && isInitializing) {
    // eslint-disable-next-line no-console
    console.log("[AUTH] loading", {
      pathname,
      meFetchStatus: meQuery.fetchStatus,
    });
  }

  useEffect(() => {
    if (!import.meta.env.DEV || !isReady) return;
    if (authState === "authenticated") {
      // eslint-disable-next-line no-console
      console.info("[AUTH] resolved", {
        state: "authenticated",
        userId: userSafe?.id ?? null,
      });
      return;
    }
    if (authState === "unauthenticated") {
      // eslint-disable-next-line no-console
      console.info("[AUTH] resolved", {
        state: "unauthenticated",
        pathname,
        degradedBySessionUnavailable: meBootstrapUnavailable,
      });
      return;
    }

    if (authState === "degraded") {
      // eslint-disable-next-line no-console
      console.warn("[AUTH] resolved", {
        state: "degraded",
        pathname,
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[BOOT ERROR] auth bootstrap", meBootstrapError);
  }, [
    authState,
    isReady,
    meBootstrapError,
    meBootstrapUnavailable,
    pathname,
    userSafe?.id,
  ]);

  const value: AuthContextType = {
    user: userSafe,
    payload,
    redirectTo,
    role,
    authState,
    bootstrapError: meBootstrapError,
    loading,
    isInitializing,
    isSubmitting,
    isAuthenticating,
    isLoggingOut,
    error:
      localError ||
      meBootstrapError ||
      loginMutation.error ||
      registerMutation.error ||
      logoutMutation.error ||
      null,
    login,
    register,
    logout,
    isAuthenticated: Boolean(userSafe),
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
