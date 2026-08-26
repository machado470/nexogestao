import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LockKeyhole } from "lucide-react";

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
        : "Erro ao redefinir senha.";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("token inválido") ||
    normalized.includes("token invalido") ||
    normalized.includes("expirado")
  ) {
    return "Esse link de redefinição é inválido ou expirou.";
  }

  if (normalized.includes("senha precisa ter ao menos 8")) {
    return "A senha precisa ter ao menos 8 caracteres.";
  }

  return message;
}

export default function ResetPasswordPage() {
  usePageMeta({
    title: "NexoGestão | Redefinir senha",
    description:
      "Defina uma nova senha para voltar ao acesso da sua conta NexoGestão com segurança.",
  });
  const [, navigate] = useLocation();
  const resetPasswordMutation = trpc.nexo.auth.resetPassword.useMutation();

  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const token = search?.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = useMemo(() => {
    if (localError) return localError;
    return resetPasswordMutation.error
      ? normalizeErrorMessage(resetPasswordMutation.error)
      : null;
  }, [localError, resetPasswordMutation.error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!token)
      return setLocalError("Token de redefinição ausente ou inválido.");
    if (!password) return setLocalError("Informe a nova senha.");
    if (password.length < 8)
      return setLocalError("A senha precisa ter ao menos 8 caracteres.");
    if (password !== confirmPassword)
      return setLocalError("As senhas não coincidem.");

    try {
      await resetPasswordMutation.mutateAsync({ token, password });
      setDone(true);
    } catch (err) {
      setLocalError(normalizeErrorMessage(err));
    }
  };

  return (
    <AuthMarketingShell
      badge="Nova senha"
      title="Redefinir senha"
      description="Defina sua nova senha para voltar ao acesso normal."
      asideTitle="Segurança e continuidade no mesmo fluxo"
      asideDescription="Redefina sua senha com feedback claro e visual consistente com landing e autenticação."
      asideItems={[
        "Token validado antes de salvar a nova senha.",
        "Mensagens objetivas para erro e sucesso.",
        "Retorno rápido para login após concluir.",
      ]}
      bottomPanelTitle="Fluxo de redefinição"
      bottomPanelSteps={[
        {
          label: "01",
          value: "Abrir link",
          description: "Token de segurança.",
        },
        {
          label: "02",
          value: "Nova senha",
          description: "Mínimo de 8 caracteres.",
        },
        { label: "03", value: "Entrar", description: "Volte ao login." },
      ]}
      backTo="/login"
      backLabel="Voltar para login"
    >
      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Senha redefinida com sucesso.
          </div>
          <Button
            className="w-full bg-orange-500 hover:bg-orange-600"
            onClick={() => navigate("/login")}
          >
            Ir para login
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repita a nova senha"
                className="pl-9"
              />
            </div>
          </div>
          {errorText ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}
          <Button
            type="submit"
            disabled={resetPasswordMutation.isPending}
            aria-busy={resetPasswordMutation.isPending}
            className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
            size="lg"
          >
            {resetPasswordMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar nova senha"
            )}
          </Button>
        </form>
      )}
    </AuthMarketingShell>
  );
}
