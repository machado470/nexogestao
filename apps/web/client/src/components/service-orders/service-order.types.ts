import type { ComponentType } from "react";

export type ServiceOrderStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELED";

export type ChargeStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELED";

export type FinancialFilter =
  | "ALL"
  | "NO_CHARGE"
  | "READY_TO_CHARGE"
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELED";

export type CustomerRef = {
  id: string;
  name: string;
  phone?: string | null;
};

export type AssignedPersonRef = {
  id: string;
  name: string;
};

export type AppointmentRef = {
  id: string;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: string | null;
};

export type FinancialSummary = {
  hasCharge: boolean;
  chargeId: string | null;
  chargeStatus: ChargeStatus | null;
  chargeAmountCents: number | null;
  chargeDueDate?: string | null;
  paidAt?: string | null;
};

export type ExecutionChecklistItem =
  | string
  | {
      label?: string | null;
      value?: string | null;
      checked?: boolean | null;
      note?: string | null;
    };

export type ExecutionAttachment =
  | string
  | {
      id?: string | null;
      name?: string | null;
      url?: string | null;
      type?: string | null;
      size?: number | null;
    };

export type TimelineEventMetadata = {
  serviceOrderId?: string | null;
  chargeId?: string | null;
  executionId?: string | null;
  amountCents?: number | null;
  status?: string | null;
  dueDate?: string | null;
  [key: string]: unknown;
};

export type ServiceOrder = {
  id: string;
  customerId: string;
  customer?: CustomerRef | null;
  assignedToPersonId?: string | null;
  assignedTo?: AssignedPersonRef | null;
  appointmentId?: string | null;
  appointment?: AppointmentRef | null;
  title: string;
  description?: string | null;
  status: ServiceOrderStatus;
  priority?: number | null;
  scheduledFor?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  amountCents?: number | null;
  dueDate?: string | null;
  cancellationReason?: string | null;
  outcomeSummary?: string | null;
  createdAt?: string;
  updatedAt?: string;
  financialSummary?: FinancialSummary | null;
  operationalDecision: {
    isOverdue: boolean;
    overdueDays: number;
    isStalled: boolean;
    chargeOverdue: boolean;
    operationalStatus: "NORMAL" | "ATENÇÃO" | "RISCO";
    priority: "P0" | "P1" | "P2" | "P3";
    riskLabel: string;
    nextAction: {
      type: "start" | "complete" | "charge" | "edit" | "select";
      label: string;
      reason: string;
    };
  };
};

export type ServiceOrdersPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type ServiceOrdersListResult = {
  data: ServiceOrder[];
  pagination: ServiceOrdersPagination;
};

export type GenerateChargeResponse = {
  created?: boolean;
  chargeId?: string;
};

export type ExecutionRecord = {
  id: string;
  serviceOrderId: string;
  customerId?: string | null;
  executorPersonId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  notes?: string | null;
  checklist?: ExecutionChecklistItem[];
  attachments?: ExecutionAttachment[];
  status?: string | null;
  amountCents?: number | null;
  dueDate?: string | null;
  mode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  idempotent?: boolean;
};

export type TimelineEvent = {
  id: string;
  action?: string | null;
  type?: string | null;
  description?: string | null;
  createdAt?: string | null;
  metadata?: TimelineEventMetadata | null;
};

export type StageTone = {
  label: string;
  description: string;
  className: string;
  icon: ComponentType<{ className?: string }>;
};
