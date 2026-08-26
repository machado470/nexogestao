import { Button } from "@/components/ui/button";

import { Chrome, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type GoogleStatus = {
  configured: boolean;
  message?: string;
};

function readSafeRedirect(): string {
  if (typeof window === "undefined") return "";

  const search = new URLSearchParams(window.location.search);
  const redirectParam = (search.get("redirect") ?? "").trim();

  if (!redirectParam.startsWith("/")) return "";
  if (redirectParam.startsWith("//")) return "";
  if (redirectParam.startsWith("/login")) return "";
  if (redirectParam.startsWith("/register")) return "";
  if (redirectParam.startsWith("/forgot-password")) return "";
  if (redirectParam.startsWith("/reset-password")) return "";

  return redirectParam;
}

/**
 * Botão de login com Google OAuth.
 * Redireciona para /api/auth/google.
 */
export function GoogleOAuthButton() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/auth/google/status", { method: "GET" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        setStatus({
          configured: Boolean(payload?.configured),
          message:
            typeof payload?.message === "string"
              ? payload.message
              : payload?.configured
                ? "Google OAuth configurado."
                : "Google OAuth não configurado neste ambiente.",
        });
      } catch {
        if (cancelled) return;
        setStatus({
          configured: false,
          message: "Não foi possível validar Google OAuth agora.",
        });
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const safeRedirect = useMemo(() => readSafeRedirect(), []);

  const handleGoogleLogin = () => {
    if (status && !status.configured) return;

    try {
      setLocalError(null);
      setIsRedirecting(true);

      const target = new URL("/api/auth/google", window.location.origin);
      if (safeRedirect) {
        target.searchParams.set("redirect", safeRedirect);
      }

      window.location.assign(target.toString());
    } catch {
      setIsRedirecting(false);
      setLocalError("Não foi possível iniciar o login com Google.");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleGoogleLogin}
        disabled={Boolean(isRedirecting || (status ? !status.configured : true))}
        variant="outline"
        className="w-full gap-2 border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-900"
        title={status?.configured ? "Entrar com Google" : status?.message}
        type="button"
      >
        {isRedirecting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Chrome className="h-5 w-5" />
        )}
        {isRedirecting
          ? "Redirecionando para Google..."
          : status
            ? status.configured
              ? "Entrar com Google"
              : "Google indisponível (configuração pendente)"
            : "Verificando Google..."}
      </Button>

      {localError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{localError}</p>
      ) : null}
    </div>
  );
}
