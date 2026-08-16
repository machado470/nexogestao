export const NOTIFICATION_TRANSPORT_VERSION = 1 as const
export const NOTIFICATION_TRANSPORT_KIND = 'notification.created' as const

export type NotificationTransportEvent = {
  version: typeof NOTIFICATION_TRANSPORT_VERSION
  eventId: string
  kind: typeof NOTIFICATION_TRANSPORT_KIND
  orgId: string
  userId: string
  notificationId: string
  createdAt: string
}

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function isCanonicalCreatedAt(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP.test(value)) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

export function isSafeLastEventId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

export function parseNotificationTransportEvent(raw: string): NotificationTransportEvent | null {
  try {
    const value = JSON.parse(raw) as Partial<NotificationTransportEvent>
    if (
      value.version !== NOTIFICATION_TRANSPORT_VERSION ||
      value.kind !== NOTIFICATION_TRANSPORT_KIND ||
      !isSafeLastEventId(value.eventId) ||
      !isSafeLastEventId(value.orgId) ||
      !isSafeLastEventId(value.userId) ||
      !isSafeLastEventId(value.notificationId) ||
      !isCanonicalCreatedAt(value.createdAt)
    ) return null
    return value as NotificationTransportEvent
  } catch {
    return null
  }
}

export function toBrowserEvent(event: NotificationTransportEvent) {
  return { version: event.version, eventId: event.eventId, kind: event.kind, createdAt: event.createdAt }
}
