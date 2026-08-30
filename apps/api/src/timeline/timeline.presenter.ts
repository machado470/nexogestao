import { Prisma, TimelineEvent } from '@prisma/client'
import { normalizeTimelineEventType } from './timeline-events'

type TimelineEventWithActor = TimelineEvent & {
  person?: { name: string } | null
}

const SAFE_METADATA_KEYS = new Set([
  'amountCents',
  'currency',
  'previousState',
  'nextState',
  'riskLevel',
  'score',
  'result',
  'status',
  'reasonCode',
  'origin',
])

function metadataRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function officialString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function safeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key, value]) =>
        SAFE_METADATA_KEYS.has(key) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'),
    ),
  )
}

/**
 * Public read model for the official operational timeline.
 *
 * Canonicalization and entity-link construction happen here, at the API
 * boundary.  The presenter deliberately does not infer classification from
 * action, description or arbitrary metadata.
 */
export function presentTimelineEvent(event: TimelineEventWithActor) {
  const metadata = metadataRecord(event.metadata)
  const entity = event.customerId
    ? {
        type: 'customer',
        id: event.customerId,
        href: `/customers?customerId=${encodeURIComponent(event.customerId)}`,
      }
    : event.serviceOrderId
      ? {
          type: 'service_order',
          id: event.serviceOrderId,
          href: `/service-orders?serviceOrderId=${encodeURIComponent(event.serviceOrderId)}`,
        }
      : event.appointmentId
        ? {
            type: 'appointment',
            id: event.appointmentId,
            href: `/appointments?appointmentId=${encodeURIComponent(event.appointmentId)}`,
          }
        : event.chargeId
          ? {
              type: 'charge',
              id: event.chargeId,
              href: `/finances?chargeId=${encodeURIComponent(event.chargeId)}`,
            }
          : null

  return {
    id: event.id,
    eventType: normalizeTimelineEventType(event.action),
    occurredAt: event.createdAt,
    actor: event.person?.name ? { name: event.person.name } : null,
    entity,
    module: officialString(metadata, 'module'),
    severity: officialString(metadata, 'severity'),
    title: officialString(metadata, 'title'),
    description: event.description,
    consequence: officialString(metadata, 'consequence'),
    recommendedAction: officialString(metadata, 'recommendedAction'),
    origin: officialString(metadata, 'origin'),
    metadata: safeMetadata(metadata),
  }
}
