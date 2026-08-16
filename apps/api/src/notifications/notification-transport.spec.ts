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
  it('isola simultaneamente tenant e usuário e limpa conexões', async () => {
    const hub = new NotificationStreamHub(); const a: string[] = []; const other: string[] = []
    const registrationA = hub.add('org_a', 'user_a', frame => { a.push(frame); return true }, jest.fn())!
    await hub.add('org_b', 'user_a', frame => { other.push(frame); return true }, jest.fn())!.finishReplay(new Set())
    await hub.add('org_a', 'user_b', frame => { other.push(frame); return true }, jest.fn())!.finishReplay(new Set())
    await registrationA.finishReplay(new Set())
    await hub.deliver(event); expect(a).toHaveLength(1); expect(other).toHaveLength(0)
    registrationA.remove(); await hub.deliver(event); expect(a).toHaveLength(1)
    hub.onApplicationShutdown(); expect(hub.count()).toBe(0)
  })
  it('ordena eventos ao vivo após replay, elimina duplicata e fecha em falha definitiva', async () => {
    const hub = new NotificationStreamHub(); const frames: string[] = []; const close = jest.fn()
    const registration = hub.add('org_a', 'user_a', frame => { frames.push(frame); return frames.length < 3 }, close)!
    await hub.deliver({ ...event, eventId: 'recipient_3', createdAt: '2026-08-16T10:00:03.000Z' })
    await hub.deliver({ ...event, eventId: 'recipient_2', createdAt: '2026-08-16T10:00:02.000Z' })
    await hub.deliver(event)
    await expect(registration.finishReplay(new Set(['recipient_1']))).resolves.toBe(true)
    expect(frames.join('')).toMatch(/recipient_2[\s\S]*recipient_3/)
    await hub.deliver({ ...event, eventId: 'recipient_4' })
    expect(close).toHaveBeenCalledTimes(1); expect(hub.count()).toBe(0)
  })
  it('exige createdAt UTC canônico e uma data civil válida', () => {
    expect(parseNotificationTransportEvent(JSON.stringify({ ...event, createdAt: '2026-08-16T10:00:00Z' }))).toBeNull()
    expect(parseNotificationTransportEvent(JSON.stringify({ ...event, createdAt: '2026-02-30T10:00:00.000Z' }))).toBeNull()
  })
  it('limita cada usuário a cinco conexões e remove de forma idempotente', () => {
    const hub = new NotificationStreamHub(); const registrations = []
    for (let index = 0; index < 5; index++) registrations.push(hub.add('org_a', 'user_a', () => true, jest.fn())!)
    expect(hub.add('org_a', 'user_a', () => true, jest.fn())).toBeNull(); expect(hub.count()).toBe(5)
    registrations[0].remove(); registrations[0].remove(); expect(hub.count()).toBe(4)
  })
  it('detecta overflow durante replay e limpa todo o pending', async () => {
    const hub = new NotificationStreamHub(); const registration = hub.add('org_a', 'user_a', () => true, jest.fn())!
    for (let index = 0; index < 101; index++) hub.deliver({ ...event, eventId: `recipient_${index}` })
    await expect(registration.finishReplay(new Set())).resolves.toBe(false); expect(hub.count()).toBe(0)
  })
  it('deduplica a transição replay/live e trata falha no replay', async () => {
    const hub = new NotificationStreamHub(); const frames: string[] = []; const close = jest.fn()
    const registration = hub.add('org_a', 'user_a', frame => { frames.push(frame); return false }, close)!
    hub.deliver(event); hub.deliver(event)
    await expect(registration.finishReplay(new Set())).resolves.toBe(false)
    expect(frames).toHaveLength(1); expect(close).toHaveBeenCalledTimes(1); expect(hub.count()).toBe(0)
  })
  it('serializa writes assíncronos sem confundir backpressure com desconexão', async () => {
    const hub = new NotificationStreamHub(); const frames: string[] = []
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    let first = true
    const registration = hub.add('org_a', 'user_a', async frame => {
      if (first) { first = false; await blocked }
      frames.push(frame); return true
    }, jest.fn())!
    await registration.finishReplay(new Set())
    const one = hub.deliver(event)
    const two = hub.deliver({ ...event, eventId: 'recipient_2' })
    await Promise.resolve(); expect(frames).toHaveLength(0)
    release(); await expect(Promise.all([one, two])).resolves.toEqual([[true], [true]])
    expect(frames.join('')).toMatch(/recipient_1[\s\S]*recipient_2/); expect(hub.count()).toBe(1)
  })
  it('shutdown fecha cada conexão uma única vez e limpa registros', () => {
    const hub = new NotificationStreamHub(); const closes = [jest.fn(), jest.fn()]
    hub.add('org_a', 'user_a', () => true, closes[0]); hub.add('org_a', 'user_b', () => true, closes[1])
    hub.onApplicationShutdown(); hub.onApplicationShutdown()
    expect(closes[0]).toHaveBeenCalledTimes(1); expect(closes[1]).toHaveBeenCalledTimes(1); expect(hub.count()).toBe(0)
  })
})
