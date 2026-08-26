import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Building2, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
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
        : "Erro ao criar conta";

  const normalized = message.toLowerCase();

  if (normalized.includes("email já cadastrado")) {
    return "Esse email já está em uso.";
  }

  if (normalized.includes("senha precisa ter ao menos 8")) {
    return "A senha precisa ter ao menos 8 caracteres.";
  }

  return message;
}

export default function Register() {
  usePageMeta({
    title: "NexoGestão | Criar conta",
    description:
      "Crie sua conta no NexoGestão e configure sua empresa para começar com operação estruturada.",
  });
  const { isSubmitting, error, register } = useAuth();
  const [, navigate] = useLocation();

  const [formData, setFormData] = useState({
    orgName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = useMemo(() => {
    if (localError) return localError;
    if (!error) return null;
    return normalizeErrorMessage(error);
  }, [localError, error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const orgName = formData.orgName.trim();
    const adminName = formData.adminName.trim();
    const email = formData.email.trim().toLowerCase();

    if (!orgName || !adminName || !email || !formData.password) {
      setLocalError("Preencha todos os campos obrigatórios.");
      return;
    }

    if (formData.password.length < 8) {
      setLocalError("A senha precisa ter ao menos 8 caracteres.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setLocalError("As senhas não coincidem.");
      return;
    }

    try {
      const result = await register({
        orgName,
        adminName,
        email,
        password: formData.password,
      });

      const emailVerificationStatus =
        result?.emailVerificationStatus ??
        result?.data?.emailVerificationStatus ??
        "provider_unavailable";

      const params = new URLSearchParams();
      params.set("email", email);
      params.set("registered", "1");
      params.set("verification", String(emailVerificationStatus));

      navigate(`/login?${params.toString()}`);
    } catch (err) {
      setLocalError(normalizeErrorMessage(err));
    }
  };

  return (
    <AuthMarketingShell
      badge="Criar conta"
      title="Criar acesso inicial"
      description="Configure a empresa e o administrador principal para começar."
      asideTitle="Comece com uma base operacional organizada desde o primeiro acesso"
      asideDescription="Crie sua empresa, defina o administrador inicial e entre direto no fluxo da plataforma."
      asideItems={[
        "Criação do tenant e do administrador no mesmo fluxo.",
        "Validação de e-mail antes do primeiro login.",
        "Navegação consistente com landing e páginas públicas.",
      ]}
      bottomPanelTitle="O que acontece ao criar sua conta"
      bottomPanelSteps={[
        {
          label: "Empresa",
          value: "Tenant inicial",
          description: "Base pronta para operar.",
        },
        {
          label: "Admin",
          value: "Acesso principal",
          description: "Usuário inicial criado.",
        },
        {
          label: "Sessão",
          value: "Validação",
          description: "Confirmação de e-mail.",
        },
      ]}
      backTo="/"
      backLabel="Voltar para a página inicial"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="orgName">Nome da empresa</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="orgName"
              placeholder="Ex.: Nexo Serviços"
              value={formData.orgName}
              onChange={e =>
                setFormData(s => ({ ...s, orgName: e.target.value }))
              }
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adminName">Seu nome</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="adminName"
              placeholder="Seu nome completo"
              value={formData.adminName}
              onChange={e =>
                setFormData(s => ({ ...s, adminName: e.target.value }))
              }
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              placeholder="voce@empresa.com"
              value={formData.email}
              onChange={e =>
                setFormData(s => ({ ...s, email: e.target.value }))
              }
              autoComplete="email"
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
              placeholder="No mínimo 8 caracteres"
              value={formData.password}
              onChange={e =>
                setFormData(s => ({ ...s, password: e.target.value }))
              }
              autoComplete="new-password"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repita sua senha"
              value={formData.confirmPassword}
              onChange={e =>
                setFormData(s => ({ ...s, confirmPassword: e.target.value }))
              }
              autoComplete="new-password"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-slate-500">
            Recomendamos uma senha forte com letras maiúsculas, minúsculas,
            números e símbolo.
          </p>
        </div>

        {errorText ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorText}
          </div>
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
              Criando conta...
            </>
          ) : (
            "Criar conta"
          )}
        </Button>

        <div className="text-center text-sm">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="font-semibold text-slate-700 hover:text-slate-900"
          >
            Entrar
          </Link>
        </div>
      </form>
    </AuthMarketingShell>
  );
}
