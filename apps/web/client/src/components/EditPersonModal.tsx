import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Pencil, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getConcurrencyErrorMessage,
  isConcurrentConflictError,
} from "@/lib/concurrency";

type Props = {
  open: boolean;
  personId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type PersonDetails = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  active: boolean;
  updatedAt: string | null;
  dailyServiceOrderCapacity: number | null;
  dailyAppointmentCapacity: number | null;
  workloadNotes: string | null;
};

type FormData = {
  name: string;
  role: string;
  email: string;
  active: boolean;
  dailyServiceOrderCapacity: string;
  dailyAppointmentCapacity: string;
  workloadNotes: string;
};

const DEFAULT_FORM: FormData = {
  name: "",
  role: "",
  email: "",
  active: true,
  dailyServiceOrderCapacity: "",
  dailyAppointmentCapacity: "",
  workloadNotes: "",
};

function normalizePersonPayload(payload: unknown): PersonDetails | null {
  const raw = (payload as { data?: unknown } | null | undefined)?.data ?? payload;

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<PersonDetails>;

  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    name: typeof candidate.name === "string" ? candidate.name : "",
    role: typeof candidate.role === "string" ? candidate.role : null,
    email: typeof candidate.email === "string" ? candidate.email : null,
    active: candidate.active === false ? false : true,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
    dailyServiceOrderCapacity: typeof candidate.dailyServiceOrderCapacity === "number" ? candidate.dailyServiceOrderCapacity : null,
    dailyAppointmentCapacity: typeof candidate.dailyAppointmentCapacity === "number" ? candidate.dailyAppointmentCapacity : null,
    workloadNotes: typeof candidate.workloadNotes === "string" ? candidate.workloadNotes : null,
  };
}

function buildForm(person: PersonDetails | null): FormData {
  if (!person) {
    return DEFAULT_FORM;
  }

  return {
    name: person.name || "",
    role: person.role || "",
    email: person.email || "",
    active: person.active !== false,
    dailyServiceOrderCapacity: person.dailyServiceOrderCapacity?.toString() ?? "",
    dailyAppointmentCapacity: person.dailyAppointmentCapacity?.toString() ?? "",
    workloadNotes: person.workloadNotes ?? "",
  };
}

function formsAreEqual(a: FormData, b: FormData) {
  return (
    a.name.trim() === b.name.trim() &&
    a.role.trim() === b.role.trim() &&
    a.email.trim() === b.email.trim() &&
    a.active === b.active &&
    a.dailyServiceOrderCapacity === b.dailyServiceOrderCapacity &&
    a.dailyAppointmentCapacity === b.dailyAppointmentCapacity &&
    a.workloadNotes.trim() === b.workloadNotes.trim()
  );
}

export default function EditPersonModal({
  open,
  personId,
  onClose,
  onSaved,
}: Props) {
  const canLoad = open && Boolean(personId);

  const personQuery = trpc.people.getById.useQuery(
    { id: String(personId) },
    {
      enabled: canLoad,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const personData = useMemo(() => {
    return normalizePersonPayload(personQuery.data);
  }, [personQuery.data]);

  const initialForm = useMemo(() => {
    return buildForm(personData);
  }, [personData]);

  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    if (open) {
      setFormData(initialForm);
    } else {
      setFormData(DEFAULT_FORM);
    }
  }, [open, initialForm]);

  const hasChanges = useMemo(() => {
    return !formsAreEqual(formData, initialForm);
  }, [formData, initialForm]);

  const updatePerson = trpc.people.update.useMutation({
    onSuccess: () => {
      toast.success("Pessoa atualizada com sucesso.");
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (isConcurrentConflictError(error)) {
        toast.error(getConcurrencyErrorMessage("cadastro da pessoa"), {
          action: {
            label: "Recarregar",
            onClick: () => void personQuery.refetch(),
          },
        });
        return;
      }
      toast.error(error.message || "Erro ao atualizar pessoa.");
    },
  });

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!personId) {
      toast.error("Pessoa inválida.");
      return;
    }

    const name = formData.name.trim();
    const role = formData.role.trim();
    const email = formData.email.trim();
    const dailyServiceOrderCapacity = formData.dailyServiceOrderCapacity ? Number(formData.dailyServiceOrderCapacity) : undefined;
    const dailyAppointmentCapacity = formData.dailyAppointmentCapacity ? Number(formData.dailyAppointmentCapacity) : undefined;

    if (!name) {
      toast.error("Informe o nome da pessoa.");
      return;
    }

    if (!role) {
      toast.error("Informe o cargo ou papel da pessoa.");
      return;
    }

    if (!hasChanges) {
      toast.message("Nenhuma alteração para salvar.");
      return;
    }

    updatePerson.mutate({
      id: String(personId),
      name,
      role,
      email: email || undefined,
      active: formData.active,
      dailyServiceOrderCapacity,
      dailyAppointmentCapacity,
      workloadNotes: formData.workloadNotes.trim() || null,
      expectedUpdatedAt: personData?.updatedAt ?? undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden border-[var(--border-subtle)] bg-[var(--card-bg)] p-0 text-[var(--text-primary)] shadow-2xl backdrop-blur">
        <DialogHeader className="border-b border-zinc-800/90 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Pencil className="h-5 w-5 text-orange-500" />
            Editar pessoa
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">
            Atualize dados de equipe sem romper o padrão visual do produto.
          </DialogDescription>
        </DialogHeader>

        {personQuery.isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : personQuery.isError || !personData ? (
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
              Não foi possível carregar os dados da pessoa.
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex max-h-[calc(90vh-84px)] flex-col">
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="edit-person-name">Nome</Label>
              <Input
                id="edit-person-name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-base)]"
                placeholder="Nome da pessoa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-person-role">Cargo / Papel</Label>
              <Input
                id="edit-person-role"
                value={formData.role}
                onChange={(e) => handleChange("role", e.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-base)]"
                placeholder="Cargo ou papel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-person-email">Email</Label>
              <Input
                id="edit-person-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-base)]"
                placeholder="Email"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-person-service-order-capacity">Capacidade diária de O.S.</Label>
                <Input id="edit-person-service-order-capacity" type="number" min="1" max="100" value={formData.dailyServiceOrderCapacity} onChange={(e) => handleChange("dailyServiceOrderCapacity", e.target.value)} className="border-[var(--border-subtle)] bg-[var(--surface-base)]" placeholder="Não configurada" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-person-appointment-capacity">Capacidade diária de agendamentos</Label>
                <Input id="edit-person-appointment-capacity" type="number" min="1" max="100" value={formData.dailyAppointmentCapacity} onChange={(e) => handleChange("dailyAppointmentCapacity", e.target.value)} className="border-[var(--border-subtle)] bg-[var(--surface-base)]" placeholder="Não configurada" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-person-workload-notes">Nota operacional</Label>
              <textarea id="edit-person-workload-notes" maxLength={500} value={formData.workloadNotes} onChange={(e) => handleChange("workloadNotes", e.target.value)} className="min-h-20 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm" placeholder="Contexto opcional sobre a capacidade planejada" />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-[var(--surface-base)]/60 p-3 text-sm">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => handleChange("active", e.target.checked)}
              />
              Pessoa ativa
            </label>

            </div>

          <DialogFooter className="border-t border-[var(--border-subtle)] px-6 py-4">
              <span className="mr-auto text-xs text-[var(--text-muted)]">
                {hasChanges ? "Alterações pendentes" : "Nada para salvar"}
              </span>

              <Button
                type="button"
                variant="outline"
                onClick={() => setFormData(initialForm)}
                disabled={!hasChanges || updatePerson.isPending}
              >
                Descartar
              </Button>

              <Button
                type="submit"
                disabled={updatePerson.isPending || !hasChanges}
                className="inline-flex items-center gap-2 bg-[var(--accent-primary)] text-[var(--primary-foreground)] hover:bg-[var(--accent-primary-hover)]"
              >
                {updatePerson.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
