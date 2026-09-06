import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('operational service boundaries', () => {
  const source = (relative: string) => readFileSync(join(__dirname, relative), 'utf8')

  it('keeps Prisma out of operational controllers', () => {
    expect(source('service-orders.controller.ts')).not.toContain('PrismaService')
    expect(source('../whatsapp/whatsapp.controller.ts')).not.toContain('PrismaService')
  })

  it('keeps Charge authority delegated to Finance and Payment out of Service Orders', () => {
    const facade = source('service-orders.service.ts')
    expect(facade).toContain('this.finance.ensureChargeForServiceOrderDone')
    expect(facade).not.toMatch(/prisma\.(charge|payment)\.(create|update|delete|upsert)/)
  })

  it('keeps Billing outside WhatsApp', () => {
    expect(source('../whatsapp/whatsapp.service.ts')).not.toMatch(/billing/i)
  })
})
