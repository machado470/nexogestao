import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthCard } from "@/components/ui/context-cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function readInviteParams() {
  if (typeof window === "undefined") return { email: "", token: "" };
  const search = new URLSearchParams(window.location.search);
  return {
    email: (search.get("email") ?? "").trim().toLowerCase(),
    token: (search.get("token") ?? "").trim(),
  };
}

function normalizeErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : typeof (error as any)?.message === "string"
        ? (error as any).message
        : "Não foi possível aceitar o convite.";

  const normalized = message.toLowerCase();

  if (normalized.includes("expirado") || normalized.includes("inválido") || normalized.includes("invalido")) {
    return "Este convite está inválido ou expirado.";
  }

  if (normalized.includes("senha") && normalized.includes("8")) {
    return "A senha deve ter no mínimo 8 caracteres.";
  }

  return message;
}

export default function AcceptInvitePage() {
  const [, navigate] = useLocation();
  const inviteParams = useMemo(() => readInviteParams(), []);

  const acceptInviteMutation = trpc.auth.acceptInvite.useMutation();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const errorText = useMemo(() => {
    if (localError) return localError;
    if (!acceptInviteMutation.error) return null;
    return normalizeErrorMessage(acceptInviteMutation.error);
  }, [acceptInviteMutation.error, localError]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!inviteParams.email || !inviteParams.token) {
      setLocalError("Link de convite inválido. Solicite um novo convite.");
      return;
    }

    const safeName = name.trim();
    if (safeName.length < 2) {
      setLocalError("Informe seu nome para concluir o convite.");
      return;
    }

    if (password.length < 8) {
      setLocalError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("As senhas não coincidem.");
      return;
    }

    try {
      await acceptInviteMutation.mutateAsync({
        email: inviteParams.email,
        token: inviteParams.token,
        name: safeName,
        password,
      });

      navigate("/executive-dashboard", { replace: true });
    } catch (error) {
      setLocalError(normalizeErrorMessage(error));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Ir para login
          </button>

          <AuthCard className="border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="space-y-3">
              <Badge variant="outline" className="w-fit">
                Convite de equipe
              </Badge>
              <div>
                <CardTitle className="text-2xl">Aceitar convite</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6">
                  Defina seu acesso para entrar na plataforma.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Email convidado</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="inviteEmail" value={inviteParams.email} className="pl-9" disabled />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Seu nome</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Nome completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="No mínimo 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pl-9"
                    />
                  </div>
                </div>

                {errorText ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    {errorText}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={acceptInviteMutation.isPending}
                  className="w-full gap-2"
                  size="lg"
                >
                  {acceptInviteMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Confirmando convite...
                    </>
                  ) : (
                    "Aceitar convite e entrar"
                  )}
                </Button>
              </form>
            </CardContent>
          </AuthCard>
        </div>
      </div>
    </div>
  );
}
