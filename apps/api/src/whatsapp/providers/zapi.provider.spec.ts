import { ZApiWhatsAppProvider } from './zapi.provider'

describe('ZApiWhatsAppProvider timeout resilience', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.ZAPI_INSTANCE_ID = 'inst-1'
    process.env.ZAPI_TOKEN = 'token-1'
    process.env.ZAPI_CLIENT_TOKEN = 'client-token-1'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('retorna erro TIMEOUT quando fetch excede o limite', async () => {
    global.fetch = jest.fn().mockRejectedValue({
      name: 'TimeoutError',
      message: 'The operation was aborted due to timeout',
    }) as any

    const provider = new ZApiWhatsAppProvider()
    const result = await provider.send({
      toPhone: '+5511999999999',
      text: 'teste timeout',
    })

    expect(result.ok).toBe(false)
    expect(result.provider).toBe('zapi')
    if (result.ok) throw new Error('expected timeout error result')
    expect((result as any).errorCode).toBe('TIMEOUT')
    expect((result as any).ambiguous).toBe(true)
  })
})
