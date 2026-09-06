import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, LockKeyhole, Mail } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { GoogleOAuthButton } from "@/components/GoogleOAuthButton";
import { AuthMarketingShell } from "@/components/AuthMarketingShell";
import { usePageMeta } from "@/hooks/usePageMeta";

function normalizeErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : typeof (error as any)?.message === "string"
        ? (error as any).message
        : "Erro ao fazer login";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("senha inválida") ||
    normalized.includes("usuário inválido") ||
    normalized.includes("credenciais inválidas") ||
    normalized.includes("invalid credentials")
  ) {
    return "Email ou senha inválidos.";
  }

  if (
    normalized.includes("não autenticado") ||
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated")
  ) {
    return "Sua sessão não pôde ser validada. Tente entrar novamente.";
  }

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("falha ao conectar no backend nexo api") ||
    normalized.includes("backend indisponível") ||
    normalized.includes("service_unavailable") ||
    normalized.includes("timeout ao chamar nexo api")
  ) {
    return "API indisponível no momento. Verifique se o backend local está ativo e acessível antes de tentar novamente.";
  }

  if (normalized.includes("conta não ativada")) {
    return "Sua conta ainda não está ativada.";
  }

  if (normalized.includes("usuário sem identidade operacional")) {
    return "Sua conta está sem vínculo operacional. Verifique o cadastro.";
  }

  return message;
}


function normalizeOAuthError(errorCode: string): string | null {
  const normalized = (errorCode ?? "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "google_oauth_not_configured") {
    return "Login com Google não está configurado neste ambiente.";
  }

  if (normalized === "google_oauth_state_secret_missing") {
    return "Configuração de segurança do Google OAuth está incompleta.";
  }

  if (normalized === "google_oauth_invalid_state") {
    return "Não foi possível validar o retorno do Google. Tente novamente.";
  }

  if (normalized === "google_email_not_verified") {
    return "Seu e-mail do Google precisa estar verificado para entrar.";
  }

  if (normalized === "google_oauth_callback_failed") {
    return "Falha ao finalizar login com Google. Tente novamente.";
  }

  return null;
}

function getSafeRedirectParam(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const value = (params.get("redirect") ?? "").trim();

  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/login")) return null;
  if (value.startsWith("/register")) return null;
  if (value.startsWith("/forgot-password")) return null;
  if (value.startsWith("/reset-password")) return null;

  return value;
}

export default function Login() {
  usePageMeta({
    title: "NexoGestão | Entrar",
    description:
      "Acesse sua conta NexoGestão com segurança e retome sua operação sem interrupções.",
  });
  const { login, isSubmitting, error, redirectTo } = useAuth();
  const [, navigate] = useLocation();
  const resendVerificationMutation =
    trpc.auth.resendEmailVerification.useMutation();

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const registeredParam = searchParams.get("registered") === "1";
  const verificationParam = (searchParams.get("verification") ?? "").trim();
  const queryEmail = (searchParams.get("email") ?? "").trim().toLowerCase();
  const oauthErrorParam = normalizeOAuthError(searchParams.get("error") ?? "");

  const [email, setEmail] = useState(queryEmail);
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSuccessMessage, setResendSuccessMessage] = useState<
    string | null
  >(null);

  const errorText = useMemo(() => {
    if (localError) return localError;
    if (oauthErrorParam) return oauthErrorParam;
    if (!error) return null;
    return normalizeErrorMessage(error);
  }, [localError, oauthErrorParam, error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setLocalError("Preencha email e senha.");
      return;
    }

    try {
      await login(normalizedEmail, password);
      navigate(getSafeRedirectParam() || redirectTo || "/executive-dashboard");
    } catch (err) {
      const normalizedError = normalizeErrorMessage(err);
      const normalizedLower = normalizedError.toLowerCase();
      const emailNotVerified =
        normalizedLower.includes("email ainda não verificado") ||
        normalizedLower.includes("e-mail ainda não verificado") ||
        normalizedLower.includes("email_not_verified");

      if (emailNotVerified) {
        setUnverifiedEmail(normalizedEmail);
      }

      setLocalError(normalizedError);
    }
  };

  const postRegisterBanner = useMemo(() => {
    if (!registeredParam) return null;

    if (verificationParam === "sent") {
      return "Conta criada. Enviamos um link de confirmação por e-mail antes do primeiro login.";
    }

    if (verificationParam === "failed") {
      return "Conta criada, mas houve falha no envio do e-mail de confirmação. Solicite um novo link abaixo.";
    }

    return "Conta criada. Este ambiente está sem provedor de e-mail no momento; solicite um novo link quando o serviço estiver ativo.";
  }, [registeredParam, verificationParam]);

  const resendVerification = async () => {
    const normalizedEmail = (unverifiedEmail ?? email).trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError("Informe seu e-mail para reenviar a confirmação.");
      return;
    }

    setLocalError(null);
    await resendVerificationMutation.mutateAsync({ email: normalizedEmail });
    setResendSuccessMessage(
      "Se o e-mail existir, um novo link de confirmação será enviado."
    );
  };

  return (
    <AuthMarketingShell
      badge="Entrar"
      title="Acessar plataforma"
      description="Use suas credenciais para entrar no ambiente da sua empresa."
      asideTitle="Entre no ambiente onde a operação deixa de viver no improviso"
      asideDescription="Clientes, agenda, ordens, financeiro e visão operacional em um fluxo claro e consistente."
      asideItems={[
        "Sessão protegida por autenticação da plataforma.",
        "Acesso rápido ao dashboard ou onboarding.",
        "Fluxo estável mesmo quando não há sessão ativa.",
      ]}
      bottomPanelTitle="Fluxo recomendado"
      bottomPanelSteps={[
        {
          label: "01",
          value: "Entrar",
          description: "Acesse com email e senha.",
        },
        {
          label: "02",
          value: "Validar sessão",
          description: "Carregamos seu contexto.",
        },
        { label: "03", value: "Operar", description: "Siga para dashboard." },
      ]}
      backTo="/"
      backLabel="Voltar para a página inicial"
    >
      <form onSubmit={submit} className="space-y-5">
        <GoogleOAuthButton />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-500">
              ou continue com e-mail
            </span>
          </div>
        </div>

        {postRegisterBanner ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {postRegisterBanner}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="voce@empresa.com"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Sua senha"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-slate-500">
            Use o acesso corporativo da sua empresa para manter o histórico
            operacional centralizado.
          </p>
        </div>

        {errorText ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorText}
          </div>
        ) : null}

        {resendSuccessMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {resendSuccessMessage}
          </div>
        ) : null}

        {unverifiedEmail ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={resendVerification}
            disabled={resendVerificationMutation.isPending}
          >
            {resendVerificationMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Reenviando confirmação...
              </>
            ) : (
              "Reenviar confirmação de e-mail"
            )}
          </Button>
        ) : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href="/register" className="text-slate-600 hover:text-slate-900">
            Criar conta
          </Link>
          <Link
            href="/forgot-password"
            className="text-slate-600 hover:text-slate-900"
          >
            Esqueci minha senha
          </Link>
        </div>
      </form>
    </AuthMarketingShell>
  );
}
