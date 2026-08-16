import { heartbeatFrame, NotificationStreamHub, notificationFrame } from './notification-stream-hub.service'
import { NOTIFICATION_TRANSPORT_KIND, NOTIFICATION_TRANSPORT_VERSION, parseNotificationTransportEvent } from './notification-transport'

const event = { version: NOTIFICATION_TRANSPORT_VERSION, kind: NOTIFICATION_TRANSPORT_KIND, eventId: 'recipient_1', orgId: 'org_a', userId: 'user_a', notificationId: 'notification_1', createdAt: '2026-08-16T10:00:00.000Z' }

describe('notification realtime transport', () => {
  it('valida envelope mínimo e não envia identidade de roteamento ao navegador', () => {
    expect(parseNotificationTransportEvent(JSON.stringify(event))).toEqual(event)
    const frame = notificationFrame(event)
    expect(frame).toContain('id: recipient_1\nevent: notification.created\n')
    expect(frame).not.toContain('org_a'); expect(frame).not.toContain('user_a'); expect(frame).not.toContain('notification_1')
  })
  it('ignora envelope inválido e mantém heartbeat como comentário', () => {
    expect(parseNotificationTransportEvent('{invalid')).toBeNull()
    expect(heartbeatFrame()).toBe(': heartbeat\n\n')
  })
  it('isola simultaneamente tenant e usuário e limpa conexões', () => {
    const hub = new NotificationStreamHub(); const a: string[] = []; const other: string[] = []
    const removeA = hub.add('org_a', 'user_a', frame => { a.push(frame); return true }, jest.fn())!
    hub.add('org_b', 'user_a', frame => { other.push(frame); return true }, jest.fn())
    hub.add('org_a', 'user_b', frame => { other.push(frame); return true }, jest.fn())
    hub.deliver(event); expect(a).toHaveLength(1); expect(other).toHaveLength(0)
    removeA(); hub.deliver(event); expect(a).toHaveLength(1)
    hub.onApplicationShutdown(); expect(hub.count()).toBe(0)
  })
})
