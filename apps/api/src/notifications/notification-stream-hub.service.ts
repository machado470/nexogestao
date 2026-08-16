import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { NotificationTransportEvent, toBrowserEvent } from './notification-transport'

export type StreamWriter = (frame: string) => boolean
const MAX_PENDING_EVENTS = 100
type Connection = {
  id: number; orgId: string; userId: string; write: StreamWriter; close: () => void; closed: boolean
  replaying: boolean; pending: NotificationTransportEvent[]; overflowed: boolean
}

export type StreamRegistration = {
  remove: () => void
  finishReplay: (replayedEventIds: ReadonlySet<string>) => boolean
}

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
    const connection: Connection = {
      id: this.nextId++, orgId, userId, write, close, closed: false,
      replaying: true, pending: [], overflowed: false,
    }
    set.add(connection); this.connections.set(key, set)
    this.logger.log(`Stream aberto; conexões=${this.count()}`)
    const remove = () => {
      if (connection.closed) return
      connection.closed = true; connection.pending.length = 0; set.delete(connection)
      if (!set.size) this.connections.delete(key)
      this.logger.log(`Stream encerrado; conexões=${this.count()}`)
    }
    return {
      remove,
      finishReplay: (replayedEventIds: ReadonlySet<string>) => {
        if (connection.closed) return false
        connection.replaying = false
        if (connection.overflowed) { remove(); return false }
        const pending = connection.pending
          .filter(event => !replayedEventIds.has(event.eventId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId))
        connection.pending = []
        for (const event of pending) {
          if (!this.write(connection, notificationFrame(event))) return false
        }
        return true
      },
    }
  }

  deliver(event: NotificationTransportEvent) {
    const set = this.connections.get(`${event.orgId}\0${event.userId}`)
    if (!set) return
    for (const connection of [...set]) {
      if (connection.closed) continue
      if (connection.replaying) {
        if (connection.pending.some(pending => pending.eventId === event.eventId)) continue
        if (connection.pending.length >= MAX_PENDING_EVENTS) connection.overflowed = true
        else connection.pending.push(event)
        continue
      }
      this.write(connection, notificationFrame(event))
    }
  }

  private write(connection: Connection, frame: string) {
    try {
      if (connection.write(frame)) return true
    } catch { /* close below */ }
    connection.closed = true
    connection.pending.length = 0
    const set = this.connections.get(`${connection.orgId}\0${connection.userId}`)
    set?.delete(connection)
    if (set && !set.size) this.connections.delete(`${connection.orgId}\0${connection.userId}`)
    try { connection.close() } catch { /* socket already closed */ }
    return false
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
