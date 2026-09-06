import fs from 'fs'
import path from 'path'

describe('WhatsApp webhook boundary guardrails', () => {
  const source = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8')

  it('registra o serviço especializado como provider Nest e mantém controller sem Prisma', () => {
    expect(source('whatsapp.module.ts')).toMatch(/providers:\s*\[[\s\S]*WhatsAppWebhookService/)
    expect(source('whatsapp-webhook.service.ts')).toMatch(/@Injectable\(\)\s*export class WhatsAppWebhookService/)
    expect(source('whatsapp.controller.ts')).not.toMatch(/PrismaService|\.prisma\b/)
  })

  it('facade delega sem instanciar serviço e mantém dispatch, claim e stale fora da fronteira', () => {
    const facade = source('whatsapp.service.ts')
    const boundary = source('whatsapp-webhook.service.ts')
    expect(facade).not.toMatch(/new WhatsAppWebhookService/)
    expect(boundary).not.toMatch(/claimMessageForDispatch|claimQueued|reconcileStaleSending|DISPATCH_MESSAGE|lockedBy|lockedAt/)
  })

  it('recovery exige orgId e todas as consultas administrativas permanecem org-scoped', () => {
    const boundary = source('whatsapp-webhook.service.ts')
    expect(boundary).toMatch(/findMany\(\{ where: \{ id: \{ in: ids \}, orgId \} \}\)/)
    expect(boundary).toMatch(/findFirst\(\{ where: \{ id, orgId \} \}\)/)
    expect(boundary).toMatch(/where: \{ id: input\.webhookEventId, orgId: input\.orgId, provider: input\.provider \}/)
  })
})
