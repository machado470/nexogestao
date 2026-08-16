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
    const registrationA = hub.add('org_a', 'user_a', frame => { a.push(frame); return true }, jest.fn())!
    hub.add('org_b', 'user_a', frame => { other.push(frame); return true }, jest.fn())!.finishReplay(new Set())
    hub.add('org_a', 'user_b', frame => { other.push(frame); return true }, jest.fn())!.finishReplay(new Set())
    registrationA.finishReplay(new Set())
    hub.deliver(event); expect(a).toHaveLength(1); expect(other).toHaveLength(0)
    registrationA.remove(); hub.deliver(event); expect(a).toHaveLength(1)
    hub.onApplicationShutdown(); expect(hub.count()).toBe(0)
  })
  it('ordena eventos ao vivo após replay, elimina duplicata e fecha cliente lento', () => {
    const hub = new NotificationStreamHub(); const frames: string[] = []; const close = jest.fn()
    const registration = hub.add('org_a', 'user_a', frame => { frames.push(frame); return frames.length < 3 }, close)!
    hub.deliver({ ...event, eventId: 'recipient_3', createdAt: '2026-08-16T10:00:03.000Z' })
    hub.deliver({ ...event, eventId: 'recipient_2', createdAt: '2026-08-16T10:00:02.000Z' })
    hub.deliver(event)
    expect(registration.finishReplay(new Set(['recipient_1']))).toBe(true)
    expect(frames.join('')).toMatch(/recipient_2[\s\S]*recipient_3/)
    hub.deliver({ ...event, eventId: 'recipient_4' })
    expect(close).toHaveBeenCalledTimes(1); expect(hub.count()).toBe(0)
  })
  it('exige createdAt UTC canônico e uma data civil válida', () => {
    expect(parseNotificationTransportEvent(JSON.stringify({ ...event, createdAt: '2026-08-16T10:00:00Z' }))).toBeNull()
    expect(parseNotificationTransportEvent(JSON.stringify({ ...event, createdAt: '2026-02-30T10:00:00.000Z' }))).toBeNull()
  })
})
