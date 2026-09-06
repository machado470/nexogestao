import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('financial domain boundaries', () => {
  const source = (module: string) =>
    readFileSync(join(__dirname, module, `${module}.service.ts`), 'utf8')

  it('keeps SaaS billing isolated from operational charges and payments', () => {
    const billing = source('billing')

    expect(billing).not.toMatch(/prisma\.(charge|payment)\b/)
    expect(billing).not.toContain("from '../finance/")
    expect(billing).not.toContain("from '../payments/")
  })

  it('keeps operational Stripe payments out of SaaS subscription persistence', () => {
    const payments = source('payments')

    expect(payments).not.toMatch(/prisma\.(plan|subscription|billingEvent)\b/)
    expect(payments).not.toContain("from '../billing/")
  })

  it('has no secondary Charge creation entry point in PaymentsService', () => {
    expect(source('payments')).not.toMatch(/async createCharge\s*\(/)
  })
})
