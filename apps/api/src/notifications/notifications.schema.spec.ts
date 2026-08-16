import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('notification persistence schema', () => {
  const root = resolve(__dirname, '../../../..')
  const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8')
  const migration = readFileSync(resolve(root, 'prisma/migrations/20260816120000_notification_recipients_foundation/migration.sql'), 'utf8')
  it('declares Notification and per-user NotificationRecipient', () => {
    expect(schema).toContain('model Notification {')
    expect(schema).toContain('model NotificationRecipient {')
    expect(schema).toContain('@@unique([orgId, eventKey])')
    expect(schema).toContain('@@unique([notificationId, userId])')
  })
  it('migration is additive and creates constraints and indexes', () => {
    expect(migration).toContain('CREATE TABLE "Notification"')
    expect(migration).toContain('CREATE TABLE "NotificationRecipient"')
    expect(migration).toContain('NotificationRecipient_userId_fkey')
    expect(migration).toContain('Notification_orgId_type_createdAt_idx')
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|INSERT INTO|ALTER COLUMN/i)
  })
})
