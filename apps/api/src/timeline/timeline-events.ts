export const CANONICAL_TIMELINE_EVENTS = [
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'SERVICE_ORDER_CREATED',
  'SERVICE_ORDER_STARTED',
  'SERVICE_ORDER_COMPLETED',
  'CHARGE_CREATED',
  'PAYMENT_RECEIVED',
  'MESSAGE_SENT',
  'MESSAGE_FAILED',
  'MESSAGE_SEND_UNCERTAIN',
  'RISK_UPDATED',
  'GOVERNANCE_RUN_STARTED',
  'GOVERNANCE_RUN_COMPLETED',
  'OPERATIONAL_STATE_CHANGED',
] as const

export type CanonicalTimelineEvent = (typeof CANONICAL_TIMELINE_EVENTS)[number]

export const LEGACY_TIMELINE_EVENT_ALIASES = {
  APPOINTMENT_CANCELED: 'APPOINTMENT_CANCELLED',
  EXECUTION_STARTED: 'SERVICE_ORDER_STARTED',
  EXECUTION_DONE: 'SERVICE_ORDER_COMPLETED',
  EXECUTION_COMPLETED: 'SERVICE_ORDER_COMPLETED',
  SERVICE_ORDER_DONE: 'SERVICE_ORDER_COMPLETED',
  SERVICE_ORDER_CHARGE_CREATED: 'CHARGE_CREATED',
  WHATSAPP_MESSAGE_SENT: 'MESSAGE_SENT',
  WHATSAPP_MESSAGE_FAILED: 'MESSAGE_FAILED',
  CUSTOMER_OPERATIONAL_RISK_UPDATED: 'RISK_UPDATED',
  RISK_SNAPSHOT_CREATED: 'RISK_UPDATED',
  OPERATIONAL_STATE_ENFORCED: 'OPERATIONAL_STATE_CHANGED',
  OPERATIONAL_WARNING_RAISED: 'OPERATIONAL_STATE_CHANGED',
} as const satisfies Record<string, CanonicalTimelineEvent>

const CANONICAL_TIMELINE_EVENT_SET = new Set<string>(CANONICAL_TIMELINE_EVENTS)

export function normalizeTimelineEventType(
  eventType: string,
): CanonicalTimelineEvent | string {
  const normalized = String(eventType ?? '').trim().toUpperCase()
  if (!normalized) return normalized
  if (CANONICAL_TIMELINE_EVENT_SET.has(normalized)) {
    return normalized as CanonicalTimelineEvent
  }
  return LEGACY_TIMELINE_EVENT_ALIASES[
    normalized as keyof typeof LEGACY_TIMELINE_EVENT_ALIASES
  ] ?? normalized
}

export function timelineEventFilterValues(eventType: string): string[] {
  const canonical = normalizeTimelineEventType(eventType)
  const values = new Set<string>([canonical])

  for (const [legacy, target] of Object.entries(LEGACY_TIMELINE_EVENT_ALIASES)) {
    if (target === canonical) values.add(legacy)
  }

  return Array.from(values)
}
