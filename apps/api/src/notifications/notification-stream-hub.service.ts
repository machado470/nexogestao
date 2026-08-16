import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { NotificationTransportEvent, toBrowserEvent } from './notification-transport'

export type StreamWriter = (frame: string) => boolean | Promise<boolean>
const MAX_PENDING_EVENTS = 100
type Connection = {
  id: number; orgId: string; userId: string; write: StreamWriter; close: () => void; closed: boolean
  replaying: boolean; pending: NotificationTransportEvent[]; overflowed: boolean
  writeTail: Promise<boolean>; queuedWrites: number
}

export type StreamRegistration = {
  remove: () => void
  finishReplay: (replayedEventIds: ReadonlySet<string>) => Promise<boolean>
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
      replaying: true, pending: [], overflowed: false, writeTail: Promise.resolve(true), queuedWrites: 0,
    }
    set.add(connection); this.connections.set(key, set)
    this.logger.log(`Stream aberto; conexões=${this.count()}`)
    const remove = () => {
      if (connection.closed) return
      connection.closed = true; connection.pending.length = 0; connection.queuedWrites = 0; set.delete(connection)
      if (!set.size) this.connections.delete(key)
      this.logger.log(`Stream encerrado; conexões=${this.count()}`)
    }
    return {
      remove,
      finishReplay: async (replayedEventIds: ReadonlySet<string>) => {
        if (connection.closed) return false
        connection.replaying = false
        if (connection.overflowed) { remove(); return false }
        const pending = connection.pending
          .filter(event => !replayedEventIds.has(event.eventId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId))
        connection.pending = []
        for (const event of pending) {
          if (!await this.write(connection, notificationFrame(event))) return false
        }
        return true
      },
    }
  }

  async deliver(event: NotificationTransportEvent): Promise<boolean[]> {
    const set = this.connections.get(`${event.orgId}\0${event.userId}`)
    if (!set) return []
    const writes: Promise<boolean>[] = []
    for (const connection of [...set]) {
      if (connection.closed) continue
      if (connection.replaying) {
        if (connection.pending.some(pending => pending.eventId === event.eventId)) continue
        if (connection.pending.length >= MAX_PENDING_EVENTS) connection.overflowed = true
        else connection.pending.push(event)
        continue
      }
      writes.push(this.write(connection, notificationFrame(event)))
    }
    return Promise.all(writes)
  }

  private write(connection: Connection, frame: string): Promise<boolean> {
    if (connection.closed) return Promise.resolve(false)
    if (connection.queuedWrites >= MAX_PENDING_EVENTS) {
      this.removeConnection(connection)
      return Promise.resolve(false)
    }
    connection.queuedWrites++
    const result = connection.writeTail.then(async previous => {
      if (!previous || connection.closed) return false
      try { return await connection.write(frame) } catch { return false }
    }).then(ok => {
      connection.queuedWrites = Math.max(0, connection.queuedWrites - 1)
      if (!ok) this.removeConnection(connection)
      return ok
    })
    connection.writeTail = result
    return result
  }

  private removeConnection(connection: Connection) {
    if (connection.closed) return
    connection.closed = true
    connection.pending.length = 0
    connection.queuedWrites = 0
    const set = this.connections.get(`${connection.orgId}\0${connection.userId}`)
    set?.delete(connection)
    if (set && !set.size) this.connections.delete(`${connection.orgId}\0${connection.userId}`)
    try { connection.close() } catch { /* socket already closed */ }
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
