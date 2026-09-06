import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

import { trpc } from "@/lib/trpc";

function extractToken() {
  if (typeof window === "undefined") return "";

  const search = new URLSearchParams(window.location.search);
  const fromQuery = (search.get("token") ?? "").trim();
  if (fromQuery) return fromQuery;

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  const hashParams = new URLSearchParams(hash);
  return (hashParams.get("token") ?? "").trim();
}

function extractRedirect() {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(window.location.search);
  const raw = (search.get("redirect") ?? "").trim();
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  if (raw.startsWith("/login")) return "";
  if (raw.startsWith("/register")) return "";
  if (raw.startsWith("/forgot-password")) return "";
  if (raw.startsWith("/reset-password")) return "";
  return raw;
}

export default function AuthCallbackPage() {
  const [, navigate] = useLocation();
  const token = useMemo(() => extractToken(), []);
  const requestedRedirect = useMemo(() => extractRedirect(), []);

  const establishSessionMutation = trpc.auth.establishSession.useMutation();

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!token) {
        navigate("/login?error=missing_callback_token", { replace: true });
        return;
      }

      try {
        const result = await establishSessionMutation.mutateAsync({ token });
        if (!active) return;
        const meRedirect = result?.me?.data?.redirect || result?.me?.redirect || "";
        const redirect =
          meRedirect === "/onboarding"
            ? "/onboarding"
            : requestedRedirect || meRedirect || "/executive-dashboard";
        navigate(redirect, { replace: true });
      } catch {
        if (!active) return;
        navigate("/login?error=oauth_callback_failed", { replace: true });
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [establishSessionMutation, navigate, requestedRedirect, token]);

  return (
    <div className="nexo-app-shell flex min-h-screen items-center justify-center px-6">
      <div className="nexo-app-panel-strong w-full max-w-md p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
        <h1 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">
          Confirmando autenticação
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] dark:text-[var(--text-muted)]">
          Estamos finalizando sua sessão com segurança.
        </p>
      </div>
    </div>
  );
}
