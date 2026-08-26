import React, { useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, Mail } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthMarketingShell } from "@/components/AuthMarketingShell";
import { usePageMeta } from "@/hooks/usePageMeta";

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    new URLSearchParams(window.location.search).get("token") ?? ""
  ).trim();
}

function getEmail() {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("email") ?? "")
    .trim()
    .toLowerCase();
}

export default function ConfirmEmailPage() {
  usePageMeta({
    title: "NexoGestão | Confirmar e-mail",
    description:
      "Confirme seu e-mail para ativar e proteger o acesso à sua conta NexoGestão.",
  });
  const [, navigate] = useLocation();
  const token = useMemo(() => getToken(), []);
  const queryEmail = useMemo(() => getEmail(), []);
  const [email, setEmail] = React.useState(queryEmail);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const verifyMutation = trpc.nexo.auth.verifyEmail.useMutation();
  const resendMutation = trpc.nexo.auth.resendEmailVerification.useMutation();

  React.useEffect(() => {
    if (!token || verifyMutation.isSuccess || verifyMutation.isPending) return;
    verifyMutation.mutate({ token });
  }, [token, verifyMutation]);

  const hasError = verifyMutation.isError || !token;

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError("Informe seu e-mail para reenviar a confirmação.");
      return;
    }

    setLocalError(null);
    await resendMutation.mutateAsync({ email: normalizedEmail });
    setResendMessage(
      "Se o e-mail existir, um novo link de confirmação será enviado."
    );
  };

  return (
    <AuthMarketingShell
      badge="Verificação"
      title="Validar e-mail"
      description="Confirme seu endereço para proteger o acesso da sua conta."
      asideTitle="Confirmação de e-mail com fluxo claro"
      asideDescription="Padronizamos esta etapa com a mesma linguagem premium da landing e das páginas de autenticação."
      asideItems={[
        "Validação automática quando o token está presente.",
        "Fallback direto para reenvio quando o link expira.",
        "Retorno simples ao login após sucesso.",
      ]}
      bottomPanelTitle="Fluxo de verificação"
      bottomPanelSteps={[
        {
          label: "01",
          value: "Abrir e-mail",
          description: "Use o link recebido.",
        },
        {
          label: "02",
          value: "Validar token",
          description: "Confirmamos seu endereço.",
        },
        { label: "03", value: "Entrar", description: "Acesso liberado." },
      ]}
      backTo="/login"
      backLabel="Voltar para login"
    >
      {verifyMutation.isPending ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" /> Validando token...
        </div>
      ) : hasError ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            O link de confirmação é inválido ou expirou. Solicite um novo e-mail
            de verificação.
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-email-resend">E-mail da conta</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="confirm-email-resend"
                type="email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value);
                  setResendMessage(null);
                }}
                className="pl-9"
              />
            </div>
          </div>

          {localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {localError}
            </div>
          ) : null}
          {resendMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {resendMessage}
            </div>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            onClick={resendVerification}
            disabled={resendMutation.isPending}
          >
            {resendMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Reenviando confirmação...
              </>
            ) : (
              "Reenviar e-mail de confirmação"
            )}
          </Button>
          <Button
            className="w-full bg-orange-500 hover:bg-orange-600"
            onClick={() => navigate("/login")}
          >
            Ir para login
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            E-mail confirmado com sucesso. Você já pode entrar na plataforma.
          </div>
          <Button
            className="w-full bg-orange-500 hover:bg-orange-600"
            onClick={() => navigate("/login")}
          >
            Entrar
          </Button>
        </div>
      )}
    </AuthMarketingShell>
  );
}
