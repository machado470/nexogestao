import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { NotificationTransportEvent, toBrowserEvent } from './notification-transport'

export type StreamWriter = (frame: string) => boolean
type Connection = { id: number; orgId: string; userId: string; write: StreamWriter; close: () => void; closed: boolean }

export function notificationFrame(event: NotificationTransportEvent) {
  return `id: ${event.eventId}\nevent: ${event.kind}\ndata: ${JSON.stringify(toBrowserEvent(event))}\n\n`
}
export const heartbeatFrame = () => ': heartbeat\n\n'

@Injectable()
export class NotificationStreamHub implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationStreamHub.name)
  private readonly connections = new Map<string, Set<Connection>>()
  private nextId = 1
  private readonly maxPerUser = 5

  add(orgId: string, userId: string, write: StreamWriter, close: () => void) {
    const key = `${orgId}\0${userId}`
    const set = this.connections.get(key) ?? new Set<Connection>()
    if (set.size >= this.maxPerUser) return null
    const connection: Connection = { id: this.nextId++, orgId, userId, write, close, closed: false }
    set.add(connection); this.connections.set(key, set)
    this.logger.log(`Stream aberto; conexões=${this.count()}`)
    return () => {
      if (connection.closed) return
      connection.closed = true; set.delete(connection)
      if (!set.size) this.connections.delete(key)
      this.logger.log(`Stream encerrado; conexões=${this.count()}`)
    }
  }

  deliver(event: NotificationTransportEvent) {
    const set = this.connections.get(`${event.orgId}\0${event.userId}`)
    if (!set) return
    for (const connection of [...set]) {
      if (connection.closed) continue
      try { connection.write(notificationFrame(event)) } catch { connection.close() }
    }
  }

  count() { return [...this.connections.values()].reduce((total, set) => total + set.size, 0) }
  onApplicationShutdown() {
    for (const set of this.connections.values()) for (const connection of set) {
      connection.closed = true
      try { connection.close() } catch { /* socket already closed */ }
    }
    this.connections.clear()
  }
}
