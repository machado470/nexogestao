import { createHmac, timingSafeEqual } from 'crypto'
import { Logger } from '@nestjs/common'
import {
  ParsedWebhookMessage,
  WhatsAppProvider,
  WhatsAppProviderHealth,
  WhatsAppSendResult,
  WhatsAppSendTemplateInput,
  WhatsAppSendTextInput,
} from './whatsapp.provider'

const META_TIMEOUT_MS = 12_000

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  private readonly providerName = 'meta_cloud'
  private readonly logger = new Logger(MetaCloudWhatsAppProvider.name)
  private readonly accessToken = process.env.META_ACCESS_TOKEN ?? ''
  private readonly phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? ''
  private readonly appSecret = process.env.META_APP_SECRET ?? ''
  private readonly apiVersion = process.env.META_API_VERSION ?? 'v20.0'

  private getMissingConfig() {
    const missing: string[] = []
    if (!this.accessToken) missing.push('META_ACCESS_TOKEN')
    if (!this.phoneNumberId) missing.push('META_PHONE_NUMBER_ID')
    return missing
  }

  async sendMessage(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> {
    const missing = this.getMissingConfig()
    if (missing.length) return { ok: false, provider: this.providerName, errorCode: 'NOT_CONFIGURED', errorMessage: `Meta Cloud não configurada: ${missing.join(', ')}`, fatal: true }
    try {
      const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: String(input.toPhone).replace(/\D/g, ''), type: 'text', text: { body: input.text } }),
      })
      const body = await response.json().catch(() => ({})) as Record<string, any>
      if (!response.ok) {
        return { ok: false, provider: this.providerName, errorCode: `HTTP_${response.status}`, errorMessage: String(body?.error?.message ?? `HTTP ${response.status}`), fatal: response.status === 401 || response.status === 403 }
      }
      return { ok: true, provider: this.providerName, providerMessageId: String(body?.messages?.[0]?.id ?? body?.message_id ?? `meta_${Date.now()}`) }
    } catch (err: any) {
      return { ok: false, provider: this.providerName, errorCode: 'NETWORK_ERROR', errorMessage: String(err?.message ?? 'network error'), ambiguous: true }
    }
  }
  async sendText(input: WhatsAppSendTextInput): Promise<WhatsAppSendResult> { return this.sendMessage(input) }
  async sendTemplate(input: WhatsAppSendTemplateInput): Promise<WhatsAppSendResult> { return this.sendText({ toPhone: input.toPhone, text: input.renderedText }) }

  parseWebhook(payload: unknown): ParsedWebhookMessage[] {
    const body = (payload ?? {}) as any
    const entries = Array.isArray(body?.entry) ? body.entry : []
    const out: ParsedWebhookMessage[] = []
    for (const entry of entries) for (const change of (entry?.changes ?? [])) {
      const value = change?.value ?? {}
      for (const msg of (value?.messages ?? [])) {
        out.push({ eventType: 'MESSAGE_RECEIVED', fromPhone: msg?.from ?? null, toPhone: value?.metadata?.display_phone_number ?? null, content: msg?.text?.body ?? null, providerMessageId: msg?.id ?? null, timestamp: msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(), metadata: msg })
      }
      for (const st of (value?.statuses ?? [])) {
        out.push({ eventType: this.mapProviderStatus(String(st?.status ?? '')), fromPhone: st?.recipient_id ?? null, toPhone: value?.metadata?.display_phone_number ?? null, content: st?.errors?.[0]?.message ?? null, providerMessageId: st?.id ?? null, timestamp: st?.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date(), metadata: st })
      }
    }
    return out
  }

  async verifyWebhookSignature(payload: unknown, headers?: Record<string, string | string[] | undefined>): Promise<boolean> {
    if (!this.appSecret) return true
    const provided = String(headers?.['x-hub-signature-256'] ?? headers?.['X-Hub-Signature-256'] ?? '').trim()
    if (!provided.startsWith('sha256=')) return false
    const digest = createHmac('sha256', this.appSecret).update(JSON.stringify(payload)).digest('hex')
    const expected = `sha256=${digest}`
    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(expected)
    if (providedBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(providedBuffer, expectedBuffer)
  }
  mapProviderStatus(status: string): ParsedWebhookMessage['eventType'] {
    const s = status.toLowerCase()
    if (s.includes('read')) return 'MESSAGE_READ'
    if (s.includes('deliver')) return 'MESSAGE_DELIVERED'
    if (s.includes('fail')) return 'MESSAGE_FAILED'
    return 'MESSAGE_RECEIVED'
  }
  getProviderName(): string { return this.providerName }
  checkHealth(): WhatsAppProviderHealth { const missingEnv=[...this.getMissingConfig()]; if(!this.appSecret) missingEnv.push('META_APP_SECRET'); return { provider: this.providerName, status: missingEnv.length===0?'configured':'misconfigured', missingEnv } }
}
