import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { registerActionFlowEvent } from "@/lib/actionFlow";
import { FormModal } from "@/components/app-modal-system";
import { AppField, AppForm, AppSelect } from "@/components/app-system";
import { invalidateOperationalGraph } from "@/lib/operationalConsistency";
import { normalizeArrayPayload } from "@/lib/query-helpers";
import { PersonAssignmentWarning } from "@/components/PersonAssignmentWarning";
import { useAssigneeWarningTelemetry } from "@/hooks/useAssigneeWarningTelemetry";

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customers: Array<{ id: string | number; name: string }>;
  initialCustomerId?: string | null;
  initialStartsAt?: string;
  initialEndsAt?: string;
}

type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "DONE"
  | "CANCELED"
  | "NO_SHOW";

const INITIAL_FORM = {
  customerId: "",
  assignedToPersonId: "",
  date: "",
  time: "",
  durationMinutes: "60",
  serviceType: "",
  status: "SCHEDULED" as AppointmentStatus,
  notes: "",
};

export function CreateAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  customers,
  initialCustomerId,
  initialStartsAt,
  initialEndsAt,
}: CreateAppointmentModalProps) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const assigneeWarningTelemetry = useAssigneeWarningTelemetry("APPOINTMENT");
  const utils = trpc.useUtils();
  const peopleQuery = trpc.people.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const collaboratorOptions = useMemo(
    () =>
      normalizeArrayPayload<any>(peopleQuery.data)
        .filter((person: any) => person?.active !== false)
        .map((person: any) => ({
          value: String(person.id),
          label: String(person.name ?? "Colaborador"),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [peopleQuery.data]
  );

  useEffect(() => {
    if (!isOpen) {
      assigneeWarningTelemetry.reset();
      return;
    }

    setFormData({
      ...INITIAL_FORM,
      customerId: initialCustomerId ? String(initialCustomerId) : "",
      date: initialStartsAt ? initialStartsAt.slice(0, 10) : "",
      time: initialStartsAt ? initialStartsAt.slice(11, 16) : "",
      durationMinutes:
        initialStartsAt && initialEndsAt
          ? String(
              Math.max(
                15,
                Math.round(
                  (new Date(initialEndsAt).getTime() -
                    new Date(initialStartsAt).getTime()) /
                    60000
                )
              )
            )
          : "60",
    });
  }, [assigneeWarningTelemetry.reset, initialCustomerId, initialEndsAt, initialStartsAt, isOpen]);

  const createAppointment = trpc.appointments.create.useMutation();

  const handleClose = () => {
    if (createAppointment.isPending) return;
    setFormData(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createAppointment.isPending) return;

    if (!formData.customerId || !formData.date || !formData.time) {
      toast.error("Cliente e data/hora de início são obrigatórios");
      return;
    }

    const startsAt = new Date(`${formData.date}T${formData.time}`);
    if (Number.isNaN(startsAt.getTime())) {
      toast.error("Data e hora inválidas");
      return;
    }
    const durationMinutes = Math.max(15, Number(formData.durationMinutes) || 60);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);

    if (
      formData.assignedToPersonId &&
      !collaboratorOptions.some(
        option => option.value === formData.assignedToPersonId
      )
    ) {
      toast.error("Selecione um colaborador válido");
      return;
    }

    const payload = {
      customerId: formData.customerId,
      assignedToPersonId: formData.assignedToPersonId || undefined,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      title: formData.serviceType.trim() || undefined,
      status: formData.status,
      notes: formData.notes.trim() || undefined,
    };

    const previousAppointments =
      utils.appointments.list.getData(undefined);
    const tempId = `temp-appointment-${Date.now()}`;
    const selectedCustomer = customers.find(
      item => String(item.id) === payload.customerId
    );

    utils.appointments.list.setData(undefined, (old: any) => {
      const raw = old as any[] | { data?: any[] } | undefined;
      const optimistic = {
        id: tempId,
        customerId: payload.customerId,
        assignedToPersonId: payload.assignedToPersonId,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        status: payload.status,
        notes: payload.notes,
        customer: selectedCustomer
          ? { id: String(selectedCustomer.id), name: selectedCustomer.name }
          : undefined,
        createdAt: new Date().toISOString(),
      };
      if (Array.isArray(raw)) return [optimistic, ...raw];
      if (raw && Array.isArray(raw.data))
        return { ...raw, data: [optimistic, ...raw.data] };
      return [optimistic];
    });

    assigneeWarningTelemetry.trackConfirmed(payload.assignedToPersonId);

    createAppointment.mutate(payload, {
      onSuccess: created => {
        utils.appointments.list.setData(undefined, (old: any) => {
          const raw = old as any[] | { data?: any[] } | undefined;
          const applyReplace = (items: any[]) =>
            items.map(item => (String(item?.id) === tempId ? created : item));
          if (Array.isArray(raw)) return applyReplace(raw);
          if (raw && Array.isArray(raw.data))
            return { ...raw, data: applyReplace(raw.data) };
          return [created];
        });
        registerActionFlowEvent("appointment_created", {
          pageContext: "appointments",
          ctaPath: "/appointments",
        });
        toast.success("Agendamento criado com sucesso!");
        setFormData(INITIAL_FORM);
        void invalidateOperationalGraph(
          utils,
          String((created as any)?.customerId ?? payload.customerId ?? "")
        );
        onSuccess();
        onClose();
      },
      onError: error => {
        utils.appointments.list.setData(
          undefined,
          previousAppointments as any
        );
        toast.error(error.message || "Erro ao criar agendamento");
      },
    });
  };

  return (
    <FormModal
      open={isOpen}
      onOpenChange={nextOpen => (!nextOpen ? handleClose() : undefined)}
      title="Novo Agendamento"
      description="Crie em segundos: cliente, data, hora e contexto mínimo para executar."
      closeBlocked={createAppointment.isPending}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createAppointment.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-appointment-form"
            disabled={createAppointment.isPending}
          >
            {createAppointment.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Agendamento"
            )}
          </Button>
        </>
      }
    >
      <AppForm id="create-appointment-form" onSubmit={handleSubmit}>
        <AppField label="Cliente *">
          <AppSelect
            value={formData.customerId}
            onValueChange={customerId =>
              setFormData({ ...formData, customerId })
            }
            placeholder="Selecione um cliente"
            options={customers.map(customer => ({
              value: String(customer.id),
              label: customer.name,
            }))}
          />
        </AppField>

        <AppField label="Responsável pelo atendimento">
          <div className="space-y-1.5">
            <AppSelect
              value={formData.assignedToPersonId || undefined}
              onValueChange={assignedToPersonId =>
                setFormData({ ...formData, assignedToPersonId })
              }
              placeholder="Selecione um colaborador"
              options={collaboratorOptions}
            />
            <PersonAssignmentWarning
              personId={formData.assignedToPersonId}
              onWarningShown={assigneeWarningTelemetry.trackShown}
            />
            {formData.assignedToPersonId ? (
              <button
                type="button"
                className="text-xs text-[var(--modal-section-muted)] transition-colors hover:text-[var(--modal-section-text)]"
                onClick={() =>
                  setFormData({ ...formData, assignedToPersonId: "" })
                }
              >
                Limpar responsável
              </button>
            ) : null}
          </div>
        </AppField>

        <div className="grid gap-3 md:grid-cols-3">
          <AppField label="Data *">
            <Input
              type="date"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </AppField>
          <AppField label="Hora *">
            <Input
              type="time"
              value={formData.time}
              onChange={e => setFormData({ ...formData, time: e.target.value })}
            />
          </AppField>
          <AppField label="Duração">
            <AppSelect
              value={formData.durationMinutes}
              onValueChange={durationMinutes =>
                setFormData({ ...formData, durationMinutes })
              }
              options={[
                { value: "30", label: "30 min" },
                { value: "45", label: "45 min" },
                { value: "60", label: "1h" },
                { value: "90", label: "1h30" },
                { value: "120", label: "2h" },
              ]}
            />
          </AppField>
        </div>

        <AppField label="Serviço (opcional)">
          <Input
            value={formData.serviceType}
            onChange={e =>
              setFormData({ ...formData, serviceType: e.target.value })
            }
            placeholder="Ex.: Instalação, Manutenção, Revisão"
          />
        </AppField>

        <AppField label="Observações">
          <Textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Observação curta para execução"
            rows={3}
          />
        </AppField>
        <p className="text-xs text-[var(--modal-section-muted)]">
          Dica operacional: a página sinaliza conflitos e próximos horários após criar.
        </p>
      </AppForm>
    </FormModal>
  );
}
