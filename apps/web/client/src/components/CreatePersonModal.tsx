import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { FormModal } from "@/components/app-modal-system";
import {
  AppField,
  AppForm,
  AppInput,
} from "@/components/app-system";
import { Button } from "@/components/ui/button";
import { registerActionFlowEvent } from "@/lib/actionFlow";
import { trpc } from "@/lib/trpc";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormData = {
  name: string;
  role: string;
  email: string;
};

const DEFAULT_FORM: FormData = {
  name: "",
  role: "",
  email: "",
};

export default function CreatePersonModal({
  open,
  onClose,
  onSaved,
}: Props) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) setFormData(DEFAULT_FORM);
  }, [open]);

  const createPerson = trpc.people.create.useMutation({
    onSuccess: () => {
      registerActionFlowEvent("person_created", {
        pageContext: "people",
        ctaPath: "/people",
      });
      toast.success("Pessoa criada com sucesso.");
      setFormData(DEFAULT_FORM);
      onSaved();
      onClose();
    },
    onError: error => {
      toast.error(error.message || "Erro ao criar pessoa.");
    },
  });

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const name = formData.name.trim();
    const role = formData.role.trim();
    const email = formData.email.trim();

    if (!name) {
      toast.error("Informe o nome da pessoa.");
      return;
    }

    if (!role) {
      toast.error("Informe o cargo ou papel da pessoa.");
      return;
    }

    createPerson.mutate({
      name,
      role,
      email: email || undefined,
    });
  };

  return (
    <FormModal
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) onClose();
      }}
      size="md"
      closeBlocked={createPerson.isPending}
      title={
        <span className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-[var(--accent-primary)]" />
          Nova pessoa
        </span>
      }
      description="Cadastre colaboradores mantendo a experiência operacional unificada."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={createPerson.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-person-form"
            disabled={createPerson.isPending}
            className="inline-flex items-center gap-2"
          >
            {createPerson.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Criar pessoa
          </Button>
        </>
      }
    >
      <AppForm id="create-person-form" onSubmit={handleSubmit}>
        <AppField label="Nome" htmlFor="person-name">
          <AppInput
            id="person-name"
            value={formData.name}
            onChange={event => handleChange("name", event.target.value)}
            placeholder="Ex: João da Silva"
          />
        </AppField>

        <AppField label="Cargo / Papel" htmlFor="person-role">
          <AppInput
            id="person-role"
            value={formData.role}
            onChange={event => handleChange("role", event.target.value)}
            placeholder="Ex: Técnico, Supervisor, Administrativo"
          />
        </AppField>

        <AppField label="Email" htmlFor="person-email">
          <AppInput
            id="person-email"
            type="email"
            value={formData.email}
            onChange={event => handleChange("email", event.target.value)}
            placeholder="Ex: pessoa@empresa.com"
          />
        </AppField>
      </AppForm>
    </FormModal>
  );
}
