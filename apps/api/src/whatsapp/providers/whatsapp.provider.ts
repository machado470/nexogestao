export type ProviderHealthStatus = 'configured' | 'misconfigured' | 'configured_mock'

export type WhatsAppProviderHealth = {
  provider: string
  status: ProviderHealthStatus
  missingEnv: string[]
}

export type WhatsAppSendTextInput = {
  toPhone: string
  text: string
  metadata?: Record<string, unknown>
}

export type WhatsAppSendTemplateInput = {
  toPhone: string
  templateKey: string
  renderedText: string
  variables?: Record<string, unknown>
}

export type ParsedWebhookMessage = {
  eventType: 'MESSAGE_DELIVERED' | 'MESSAGE_READ' | 'MESSAGE_FAILED' | 'MESSAGE_RECEIVED'
  fromPhone: string | null
  toPhone: string | null
  content: string | null
  providerMessageId: string | null
  timestamp: Date | null
  metadata?: Record<string, unknown>
}

export type WhatsAppSendSuccessResult = {
  ok: true
  provider: string
  providerMessageId: string
}

export type WhatsAppSendErrorResult = {
  ok: false
  provider: string
  errorCode: string
  errorMessage: string
  fatal?: boolean
  ambiguous?: boolean
}

export type WhatsAppSendResult = WhatsAppSendSuccessResult | WhatsAppSendErrorResult

export interface WhatsAppProvider {
  sendMessage(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult>
  sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult>
  sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult>
  parseWebhook(payload: unknown): ParsedWebhookMessage[]
  verifyWebhookSignature(payload: unknown, headers?: Record<string, string | string[] | undefined>): Promise<boolean> | boolean
  mapProviderStatus(status: string): ParsedWebhookMessage['eventType']
  getProviderName(): string
  checkHealth(): WhatsAppProviderHealth
}

export function isWhatsAppSendError(result: WhatsAppSendResult): result is WhatsAppSendErrorResult {
  return result.ok === false
}

export function isFatalWhatsAppSendError(result: WhatsAppSendErrorResult): boolean {
  if (result.fatal) return true

  const normalizedCode = (result.errorCode ?? '').toUpperCase()
  const normalizedMessage = (result.errorMessage ?? '').toLowerCase()

  if (
    normalizedCode === 'NOT_CONFIGURED'
    || normalizedCode === 'UNAUTHORIZED'
    || normalizedCode === 'FORBIDDEN'
    || normalizedCode === 'HTTP_401'
    || normalizedCode === 'HTTP_403'
  ) {
    return true
  }

  const fatalMessageHints = [
    'subscribe to this instance again',
    'assinatura',
    'subscription',
    'instance not subscribed',
    'client-token',
    'invalid token',
    'token inválido',
    'token invalido',
  ]

  return fatalMessageHints.some((hint) => normalizedMessage.includes(hint))
}
