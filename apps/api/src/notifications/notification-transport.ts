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
      typeof value.createdAt !== 'string' ||
      Number.isNaN(Date.parse(value.createdAt))
    ) return null
    return value as NotificationTransportEvent
  } catch {
    return null
  }
}

export function toBrowserEvent(event: NotificationTransportEvent) {
  return { version: event.version, eventId: event.eventId, kind: event.kind, createdAt: event.createdAt }
}
