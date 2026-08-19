import { Logger } from '@nestjs/common'
import {
  ParsedWebhookMessage,
  WhatsAppProvider,
  WhatsAppProviderHealth,
  WhatsAppSendResult,
  WhatsAppSendTemplateInput,
  WhatsAppSendTextInput,
} from './whatsapp.provider'

const ZAPI_BASE_URL = 'https://api.z-api.io'
const ZAPI_TIMEOUT_MS = 12_000

export class ZApiWhatsAppProvider implements WhatsAppProvider {
  private readonly providerName = 'zapi'
  private readonly logger = new Logger(ZApiWhatsAppProvider.name)
  private readonly instanceId = process.env.ZAPI_INSTANCE_ID ?? ''
  private readonly token = process.env.ZAPI_TOKEN ?? ''
  private readonly clientToken = process.env.ZAPI_CLIENT_TOKEN ?? ''

  private getMissingConfig(): string[] {
    const missing: string[] = []
    if (!this.instanceId) missing.push('ZAPI_INSTANCE_ID')
    if (!this.token) missing.push('ZAPI_TOKEN')
    if (!this.clientToken) missing.push('ZAPI_CLIENT_TOKEN')
    return missing
  }

  private normalizePhone(phone: string): string {
    const digits = String(phone ?? '').replace(/\D/g, '')
    if (digits.startsWith('55') && digits.length >= 12) return digits
    if (digits.length === 10 || digits.length === 11) return `55${digits}`
    return digits
  }

  private async sendRaw(phone: string, text: string): Promise<WhatsAppSendResult> {
    const missing = this.getMissingConfig()
    if (missing.length > 0) {
      return {
        ok: false,
        provider: this.providerName,
        errorCode: 'NOT_CONFIGURED',
        errorMessage: `Z-API não configurada: ${missing.join(', ')}`,
        fatal: true,
      }
    }

    const url = `${ZAPI_BASE_URL}/instances/${this.instanceId}/token/${this.token}/send-text`

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(ZAPI_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': this.clientToken,
        },
        body: JSON.stringify({ phone, message: text }),
      })

      const body = await response.json().catch(() => ({})) as Record<string, any>
      if (!response.ok) {
        const statusErrorCode =
          response.status === 401
            ? 'UNAUTHORIZED'
            : response.status === 403
              ? 'FORBIDDEN'
              : `HTTP_${response.status}`

        return {
          ok: false,
          provider: this.providerName,
          errorCode: statusErrorCode,
          errorMessage: String(body?.message ?? body?.error ?? `HTTP ${response.status}`),
          fatal: response.status === 401 || response.status === 403,
        }
      }

      return {
        ok: true,
        provider: this.providerName,
        providerMessageId: String(body?.messageId ?? body?.zaapId ?? body?.id ?? `zapi_${Date.now()}`),
      }
    } catch (err: any) {
      const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      return {
        ok: false,
        provider: this.providerName,
        errorCode: timeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        errorMessage: timeout ? `Timeout de ${ZAPI_TIMEOUT_MS}ms` : String(err?.message ?? 'Erro de rede'),
        ambiguous: true,
      }
    }
  }


  async send(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> { return this.sendMessage(input) }
  async sendMessage(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> {
    return this.sendText(input)
  }
  async sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> {
    const phone = this.normalizePhone(input.toPhone)
    if (phone.length < 12) {
      return { ok: false, provider: this.providerName, errorCode: 'INVALID_PHONE', errorMessage: 'Telefone inválido' }
    }
    return this.sendRaw(phone, input.text)
  }

  async sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult> {
    return this.sendText({ toPhone: input.toPhone, text: input.renderedText })
  }

  parseWebhook(payload: unknown): ParsedWebhookMessage[] {
    const data = (payload ?? {}) as Record<string, any>
    const list = Array.isArray(data.messages)
      ? data.messages
      : Array.isArray(data.data)
        ? data.data
        : [data]

    return list
      .map((item: Record<string, any>) => ({
        eventType: this.mapProviderStatus(String(item.eventType ?? data.eventType ?? 'message.received')),
        fromPhone: String(item.phone ?? item.from ?? item.sender ?? '').trim() || null,
        toPhone: String(item.to ?? item.toPhone ?? '').trim() || null,
        content: String(item.text?.message ?? item.text ?? item.message ?? '').trim() || null,
        providerMessageId: String(item.messageId ?? item.id ?? '').trim() || null,
        timestamp: item.momment ? new Date(Number(item.momment) * 1000) : new Date(),
        metadata: item,
      }))
      .filter((msg) => Boolean(msg.fromPhone || msg.content))
  }

  getProviderName(): string {
    return this.providerName
  }
  verifyWebhookSignature(): boolean {
    return true
  }
  mapProviderStatus(status: string): ParsedWebhookMessage['eventType'] {
    const normalized = status.toLowerCase()
    if (normalized.includes('read')) return 'MESSAGE_READ'
    if (normalized.includes('deliver')) return 'MESSAGE_DELIVERED'
    if (normalized.includes('fail')) return 'MESSAGE_FAILED'
    return 'MESSAGE_RECEIVED'
  }

  checkHealth(): WhatsAppProviderHealth {
    const missingEnv = this.getMissingConfig()
    return {
      provider: this.providerName,
      status: missingEnv.length === 0 ? 'configured' : 'misconfigured',
      missingEnv,
    }
  }
}
