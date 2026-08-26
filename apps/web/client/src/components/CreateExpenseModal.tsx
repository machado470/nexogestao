import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, PlusCircle, Receipt } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormModal } from "@/components/app-modal-system";

type Props = { open: boolean; onClose: () => void; onCreated?: () => void };

const CATEGORY_OPTIONS = [
  "HOUSING",
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "PAYROLL",
  "MARKET",
  "TRANSPORT",
  "LEISURE",
  "OPERATIONS",
  "OTHER",
] as const;
const TYPE_OPTIONS = ["FIXED", "VARIABLE"] as const;
const RECURRENCE_OPTIONS = ["NONE", "MONTHLY"] as const;

type ExpenseCategory = (typeof CATEGORY_OPTIONS)[number];
type ExpenseType = (typeof TYPE_OPTIONS)[number];
type ExpenseRecurrence = (typeof RECURRENCE_OPTIONS)[number];

type FormData = {
  title: string;
  description: string;
  amount: string;
  category: ExpenseCategory;
  type: ExpenseType;
  recurrence: ExpenseRecurrence;
  occurredAt: string;
  notes: string;
  quickEntry: string;
  showDetails: boolean;
};

const DEFAULT_FORM: FormData = {
  title: "",
  description: "",
  amount: "",
  category: "OTHER",
  type: "VARIABLE",
  recurrence: "NONE",
  occurredAt: new Date().toISOString().slice(0, 10),
  notes: "",
  quickEntry: "",
  showDetails: false,
};

const categoryLabels: Record<ExpenseCategory, string> = {
  HOUSING: "Casa",
  ELECTRICITY: "Luz",
  WATER: "Água",
  INTERNET: "Internet",
  PAYROLL: "Funcionários",
  MARKET: "Mercado",
  TRANSPORT: "Transporte",
  LEISURE: "Lazer",
  OPERATIONS: "Operacional",
  OTHER: "Outros",
};

const quickCategoryChips: Array<{ label: string; value: ExpenseCategory }> = [
  { label: "Operacional", value: "OPERATIONS" },
  { label: "Mercado", value: "MARKET" },
  { label: "Funcionários", value: "PAYROLL" },
  { label: "Transporte", value: "TRANSPORT" },
  { label: "Outros", value: "OTHER" },
];

function parseQuickEntry(text: string) {
  const clean = text.trim().toLowerCase();
  if (!clean) return null;

  const amountMatch = clean.match(/(\d+[\d.,]*)/);
  const amount = amountMatch ? amountMatch[1].replace(",", ".") : "";

  const categoryHint = quickCategoryChips.find((item) => clean.includes(item.label.toLowerCase()));
  const recurrence = clean.includes("mensal") ? "MONTHLY" : "NONE";

  const title = clean
    .replace(/(\d+[\d.,]*)/, "")
    .replace("mensal", "")
    .trim();

  return {
    title: title.length > 0 ? title.charAt(0).toUpperCase() + title.slice(1) : "",
    amount,
    recurrence: recurrence as ExpenseRecurrence,
    category: categoryHint?.value,
  };
}

export default function CreateExpenseModal({ open, onClose, onCreated }: Props) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const quickEntryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) setFormData(DEFAULT_FORM);
  }, [open]);

  const createMutation = trpc.expenses.createExpense.useMutation({
    onSuccess: () => {
      toast.success("Despesa criada com sucesso.");
      setFormData(DEFAULT_FORM);
      onCreated?.();
      onClose();
    },
    onError: (err) => toast.error(err.message || "Erro ao criar despesa."),
  });

  const amountNumber = Number(formData.amount.replace(",", "."));
  const isValid = Boolean(formData.title.trim()) && Number.isFinite(amountNumber) && amountNumber > 0;

  const impactSummary = useMemo(() => {
    const value = Number.isFinite(amountNumber)
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountNumber)
      : "—";

    return {
      title: formData.title.trim() || "Sem título",
      value,
      category: categoryLabels[formData.category],
      type: formData.type === "FIXED" ? "Fixa" : "Variável",
      recurrence: formData.recurrence === "MONTHLY" ? "Mensal" : "Única",
      monthlyResult: formData.type === "VARIABLE" ? "Entra no resultado do mês" : "Pressão recorrente previsível",
    };
  }, [amountNumber, formData.category, formData.recurrence, formData.title, formData.type]);

  const applyQuickEntry = () => {
    const parsed = parseQuickEntry(formData.quickEntry);
    if (!parsed) return;

    setFormData((prev) => ({
      ...prev,
      title: parsed.title || prev.title,
      amount: parsed.amount || prev.amount,
      recurrence: parsed.recurrence,
      category: parsed.category || prev.category,
      showDetails: true,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Informe o título da despesa.");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error("Informe um valor válido maior que zero.");
      return;
    }

    createMutation.mutate({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      amount: amountNumber,
      category: formData.category,
      type: formData.type,
      recurrence: formData.recurrence,
      occurredAt: new Date(`${formData.occurredAt}T12:00:00`),
      notes: formData.notes.trim() || undefined,
    });
  };

  const handleClose = () => {
    if (createMutation.isPending) return;
    onClose();
  };

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      closeBlocked={createMutation.isPending}
      size="lg"
      initialFocusRef={quickEntryRef}
      title={
        <span className="inline-flex items-center gap-2">
          <Receipt className="h-5 w-5 text-[var(--accent-primary)]" />
          Nova despesa
        </span>
      }
      description="Registre uma despesa com modo rápido e ajuste fino só quando precisar."
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--modal-section-muted)]">
            {formData.recurrence === "MONTHLY"
              ? "Entrará automaticamente nos próximos meses enquanto estiver ativa."
              : "Lançamento único para o ciclo atual."}
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="create-expense-form" disabled={createMutation.isPending || !isValid} className="min-w-[210px]">
              {createMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  {formData.recurrence === "MONTHLY" ? "Criar e repetir mensalmente" : "Criar despesa"}
                </span>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form id="create-expense-form" onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-3 rounded-[0.95rem] nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--modal-section-text)]">Modo rápido</p>
            <p className="text-xs text-[var(--modal-section-muted)]">Descreva de forma livre para acelerar o preenchimento.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={quickEntryRef}
              value={formData.quickEntry}
              onChange={(e) => setFormData((prev) => ({ ...prev, quickEntry: e.target.value }))}
              placeholder="energia 320 mensal"
              disabled={createMutation.isPending}
            />
            <Button type="button" variant="outline" onClick={applyQuickEntry} disabled={createMutation.isPending || !formData.quickEntry.trim()}>
              Aplicar sugestão
            </Button>
          </div>
          <p className="text-xs text-[var(--modal-section-muted)]">Exemplos: mercado 450 · aluguel 3000 · combustível 280.</p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--modal-section-text)]">Essenciais</p>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setFormData((prev) => ({ ...prev, showDetails: !prev.showDetails }))}
            >
              {formData.showDetails ? "Ocultar detalhes" : "Ver detalhes"}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-[var(--modal-section-muted)]">Título *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ex.: Energia da unidade"
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--modal-section-muted)]">Valor *</label>
              <Input
                inputMode="decimal"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0,00"
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--modal-section-muted)]">Data *</label>
              <Input
                type="date"
                value={formData.occurredAt}
                onChange={(e) => setFormData((prev) => ({ ...prev, occurredAt: e.target.value }))}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
        </section>

        {formData.showDetails ? (
          <section className="space-y-4 rounded-[0.95rem] nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4">
            <p className="text-sm font-semibold text-[var(--modal-section-text)]">Classificação e contexto</p>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--modal-section-muted)]">Categoria</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {quickCategoryChips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, category: chip.value }))}
                    className="rounded-full nexo-field border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-1 text-xs text-[var(--modal-section-text)] transition hover:border-[var(--accent-primary)]/50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value as ExpenseCategory }))}
                disabled={createMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryLabels[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--modal-section-muted)]">Tipo</label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as ExpenseType }))}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "FIXED" ? "Fixa" : "Variável"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--modal-section-muted)]">Recorrência</label>
                <Select
                  value={formData.recurrence}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, recurrence: value as ExpenseRecurrence }))
                  }
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((recurrence) => (
                      <SelectItem key={recurrence} value={recurrence}>
                        {recurrence === "NONE" ? "Única" : "Mensal"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--modal-section-muted)]">Descrição</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Contexto rápido da despesa"
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--modal-section-muted)]">Observações</label>
                <Textarea
                  rows={2}
                  className="max-h-28 resize-y"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Detalhes complementares"
                  disabled={createMutation.isPending}
                />
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[0.95rem] nexo-modal-section border border-[var(--modal-section-border)] bg-[var(--modal-section-bg)] p-4">
          <p className="text-sm font-semibold text-[var(--modal-section-text)]">Resumo de impacto</p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-[var(--modal-section-muted)]">Título:</span> {impactSummary.title}</p>
            <p><span className="text-[var(--modal-section-muted)]">Valor:</span> {impactSummary.value}</p>
            <p><span className="text-[var(--modal-section-muted)]">Categoria:</span> {impactSummary.category}</p>
            <p><span className="text-[var(--modal-section-muted)]">Tipo:</span> {impactSummary.type}</p>
            <p><span className="text-[var(--modal-section-muted)]">Recorrência:</span> {impactSummary.recurrence}</p>
            <p><span className="text-[var(--modal-section-muted)]">Resultado:</span> {impactSummary.monthlyResult}</p>
          </div>
        </section>
      </form>
    </FormModal>
  );
}
