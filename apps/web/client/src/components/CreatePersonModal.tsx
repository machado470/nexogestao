import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
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

import { registerActionFlowEvent } from "@/lib/actionFlow";

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

export default function CreatePersonModal({ open, onClose, onSaved }: Props) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) {
      setFormData(DEFAULT_FORM);
    }
  }, [open]);

  const createPerson = trpc.people.create.useMutation({
    onSuccess: () => {
      registerActionFlowEvent("person_created", { pageContext: "people", ctaPath: "/people" });
      toast.success("Pessoa criada com sucesso.");
      setFormData(DEFAULT_FORM);
      onSaved();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar pessoa.");
    },
  });

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="nexo-modal-content max-h-[90vh] max-w-2xl overflow-hidden border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)] shadow-2xl backdrop-blur">
        <DialogHeader className="nexo-modal-header border-b border-[var(--border-subtle)] px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <UserPlus className="h-5 w-5 text-orange-500" />
            Nova pessoa
          </DialogTitle>
          <DialogDescription className="text-[var(--text-muted)]">Cadastre colaboradores mantendo a experiência visual unificada.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="nexo-modal-body space-y-4 px-6 py-5 pb-28">
          <div className="space-y-2">
            <Label htmlFor="person-name">Nome</Label>
            <Input
              id="person-name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="border-[var(--border-subtle)]"
              placeholder="Ex: João da Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-role">Cargo / Papel</Label>
            <Input
              id="person-role"
              value={formData.role}
              onChange={(e) => handleChange("role", e.target.value)}
              className="border-[var(--border-subtle)]"
              placeholder="Ex: Técnico, Supervisor, Administrativo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-email">Email</Label>
            <Input
              id="person-email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="border-[var(--border-subtle)]"
              placeholder="Ex: pessoa@empresa.com"
            />
          </div>

          </div>

          <DialogFooter className="nexo-modal-footer border-t border-[var(--border-subtle)] px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={createPerson.isPending}>
              Cancelar
            </Button>

            <Button
              type="submit"
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
