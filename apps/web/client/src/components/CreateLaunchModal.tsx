import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, PlusCircle, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";


type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type LaunchType = "INCOME" | "EXPENSE" | "TRANSFER";

type FormData = {
  description: string;
  amount: string;
  type: LaunchType;
  date: string;
  category: string;
  account: string;
  notes: string;
};

const DEFAULT_FORM: FormData = {
  description: "",
  amount: "",
  type: "INCOME",
  date: new Date().toISOString().slice(0, 10),
  category: "",
  account: "",
  notes: "",
};

export default function CreateLaunchModal({ open, onClose, onSaved }: Props) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) {
      setFormData(DEFAULT_FORM);
    }
  }, [open]);

  const createMutation = trpc.launches.create.useMutation({
    onSuccess: () => {
      toast.success("Lançamento criado com sucesso.");
      setFormData(DEFAULT_FORM);
      onSaved();
      onClose();
    },
    onError: error => {
      toast.error(error.message || "Erro ao criar lançamento.");
    },
  });

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const description = formData.description.trim();
    const category = formData.category.trim();
    const account = formData.account.trim();
    const notes = formData.notes.trim();
    const amount = Number(formData.amount);

    if (!description) {
      toast.error("Informe a descrição do lançamento.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor válido maior que zero.");
      return;
    }

    if (!category) {
      toast.error("Informe a categoria do lançamento.");
      return;
    }

    if (!formData.date) {
      toast.error("Informe a data do lançamento.");
      return;
    }

    createMutation.mutate({
      description,
      amount,
      type: formData.type,
      date: new Date(`${formData.date}T12:00:00`),
      category,
      account: account || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden border-[var(--border-subtle)] p-0 shadow-sm">
        <div className="flex max-h-[90vh] w-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
            <div className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold">Novo lançamento</h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-[var(--surface-base)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Descrição</label>
                <input
                  value={formData.description}
                  onChange={e => handleChange("description", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: pagamento fornecedor, aporte caixa, transferência interna"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={e => handleChange("amount", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  value={formData.type}
                  onChange={e => handleChange("type", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="INCOME">Entrada</option>
                  <option value="EXPENSE">Saída</option>
                  <option value="TRANSFER">Transferência</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <input
                  value={formData.category}
                  onChange={e => handleChange("category", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: Operacional, Caixa, Fornecedor"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Conta</label>
                <input
                  value={formData.account}
                  onChange={e => handleChange("account", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ex: Caixa principal, Banco, Nubank PJ"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Data</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => handleChange("date", e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <textarea
                  value={formData.notes}
                  onChange={e => handleChange("notes", e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Observações opcionais sobre o lançamento"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="h-4 w-4" />
                )}
                Criar lançamento
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
