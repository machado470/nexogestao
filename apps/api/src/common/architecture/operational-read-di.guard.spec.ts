import { readFileSync } from 'fs'
import { join } from 'path'

describe('operational read service dependency injection', () => {
  const source = (relativePath: string) =>
    readFileSync(join(__dirname, '..', '..', relativePath), 'utf8')

  it.each([
    ['service-orders/service-orders.service.ts', 'ServiceOrderReadService'],
    ['whatsapp/whatsapp.service.ts', 'WhatsAppConversationReadService'],
  ])('does not construct %s dependencies inside its facade', (facade, dependency) => {
    const manualConstruction = new RegExp(`\\b${['ne', 'w'].join('')}\\s+${dependency}\\s*\\(`)

    expect(source(facade)).not.toMatch(manualConstruction)
  })

  it.each([
    ['service-orders/service-orders.module.ts', 'ServiceOrderReadService'],
    ['whatsapp/whatsapp.module.ts', 'WhatsAppConversationReadService'],
  ])('registers the read provider in %s', (modulePath, provider) => {
    expect(source(modulePath)).toMatch(new RegExp(`providers\\s*:\\s*\\[[\\s\\S]*\\b${provider}\\b`))
  })
})
