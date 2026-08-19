import { MetaCloudWhatsAppProvider } from './meta-cloud.provider'

describe('MetaCloudWhatsAppProvider resultado ambíguo', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = 'token-1'
    process.env.META_PHONE_NUMBER_ID = 'phone-number-1'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  it('classifica timeout de transporte como resultado ambíguo', async () => {
    global.fetch = jest.fn().mockRejectedValue({
      name: 'TimeoutError',
      message: 'The operation was aborted due to timeout',
    }) as any

    const provider = new MetaCloudWhatsAppProvider()

    const result = await provider.sendText({
      toPhone: '+5511999999999',
      text: 'teste',
    })

    expect(result.ok).toBe(false)

    if (result.ok) {
      throw new Error('expected send error')
    }

    expect((result as any).errorCode).toBe('NETWORK_ERROR')
    expect((result as any).ambiguous).toBe(true)
  })

  it('classifica erro de conexão como resultado ambíguo', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('ECONNRESET'),
    ) as any

    const provider = new MetaCloudWhatsAppProvider()

    const result = await provider.sendText({
      toPhone: '+5511999999999',
      text: 'teste',
    })

    expect(result.ok).toBe(false)

    if (result.ok) {
      throw new Error('expected send error')
    }

    expect((result as any).errorCode).toBe('NETWORK_ERROR')
    expect((result as any).ambiguous).toBe(true)
  })
})
