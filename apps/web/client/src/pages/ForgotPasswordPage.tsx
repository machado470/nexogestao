import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Mail } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthMarketingShell } from "@/components/AuthMarketingShell";
import { usePageMeta } from "@/hooks/usePageMeta";

function normalizeErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : typeof (error as any)?.message === "string"
        ? (error as any).message
        : "Erro ao solicitar redefinição de senha.";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("não está disponível no momento") ||
    normalized.includes("recuperação de senha por e-mail")
  ) {
    return "A recuperação por e-mail ainda não está disponível neste ambiente.";
  }

  return message;
}

export default function ForgotPasswordPage() {
  usePageMeta({
    title: "NexoGestão | Recuperar senha",
    description:
      "Solicite a redefinição de senha para recuperar o acesso à sua conta NexoGestão.",
  });
  const [, navigate] = useLocation();
  const forgotPasswordMutation = trpc.nexo.auth.forgotPassword.useMutation();

  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = useMemo(() => {
    if (localError) return localError;
    return forgotPasswordMutation.error
      ? normalizeErrorMessage(forgotPasswordMutation.error)
      : null;
  }, [localError, forgotPasswordMutation.error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setWarning(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError("Informe seu email.");
      return;
    }

    try {
      await forgotPasswordMutation.mutateAsync({ email: normalizedEmail });
      setDone(true);
    } catch (err) {
      const normalized = normalizeErrorMessage(err);
      if (normalized.includes("ainda não está disponível")) {
        setDone(true);
        setWarning(
          "Recuperação por e-mail indisponível neste ambiente. Peça ao administrador para redefinir sua senha."
        );
        return;
      }
      setLocalError(normalized);
    }
  };

  return (
    <AuthMarketingShell
      badge="Recuperação"
      title="Esqueci minha senha"
      description="Informe seu email para receber o link de redefinição."
      asideTitle="Recupere o acesso sem interromper a operação"
      asideDescription="Fluxo de recuperação alinhado ao padrão visual e estrutural da experiência pública do NexoGestão."
      asideItems={[
        "Solicitação segura via e-mail da conta.",
        "Mensagens claras para sucesso e falha.",
        "Navegação consistente de volta ao login e home.",
      ]}
      bottomPanelTitle="Fluxo de recuperação"
      bottomPanelSteps={[
        { label: "01", value: "Solicitar", description: "Informe seu e-mail." },
        {
          label: "02",
          value: "Receber link",
          description: "Verifique sua caixa.",
        },
        { label: "03", value: "Redefinir", description: "Defina nova senha." },
      ]}
      backTo="/login"
      backLabel="Voltar para login"
    >
      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {warning ??
              "Se esse email existir, você vai receber um link de redefinição."}
          </div>
          <Button
            className="w-full bg-orange-500 hover:bg-orange-600"
            onClick={() => navigate("/login")}
          >
            Voltar para login
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
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
            <p className="text-xs text-slate-500">
              Enviaremos as instruções para o e-mail informado, se houver conta
              válida.
            </p>
          </div>

          {errorText ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={forgotPasswordMutation.isPending}
            aria-busy={forgotPasswordMutation.isPending}
            className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
            size="lg"
          >
            {forgotPasswordMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar link"
            )}
          </Button>
        </form>
      )}
    </AuthMarketingShell>
  );
}
