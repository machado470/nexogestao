import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Person planned workload capacity schema', () => {
  const schema = readFileSync(resolve(process.cwd(), '../../prisma/schema.prisma'), 'utf8')
  const migration = readFileSync(resolve(process.cwd(), '../../prisma/migrations/20260530210000_add_person_planned_workload_capacity/migration.sql'), 'utf8')

  it('declara os campos mínimos de capacidade na pessoa', () => {
    expect(schema).toMatch(/^\s*dailyServiceOrderCapacity\s+Int\?\s+@default\(5\)\s*$/m)
    expect(schema).toMatch(/^\s*dailyAppointmentCapacity\s+Int\?\s+@default\(5\)\s*$/m)
    expect(schema).toMatch(/^\s*workloadNotes\s+String\?\s*$/m)
  })

  it('adiciona os campos com uma migration aditiva segura', () => {
    expect(migration).toContain('ALTER TABLE "Person"')
    expect(migration).toContain('ADD COLUMN "dailyServiceOrderCapacity" INTEGER DEFAULT 5')
    expect(migration).toContain('ADD COLUMN "dailyAppointmentCapacity" INTEGER DEFAULT 5')
    expect(migration).toContain('ADD COLUMN "workloadNotes" TEXT')
    expect(migration).not.toContain('DROP COLUMN')
  })
})
