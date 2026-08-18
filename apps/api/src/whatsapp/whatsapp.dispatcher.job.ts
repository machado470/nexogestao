// apps/api/src/whatsapp/whatsapp.dispatcher.job.ts

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { QueueService } from '../queue/queue.service'
import { WhatsAppService } from './whatsapp.service'
import {
  isFatalWhatsAppSendError,
  isWhatsAppSendError,
} from './providers/whatsapp.provider'
import { createWhatsAppProvider } from './providers/provider.factory'

@Injectable()
export class WhatsAppDispatcherJob {
  private readonly logger = new Logger(WhatsAppDispatcherJob.name)
  private readonly provider = createWhatsAppProvider()

  constructor(
    private readonly whatsApp: WhatsAppService,
    private readonly queueService: QueueService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchQueued() {
    if (process.env.DISABLE_WHATSAPP_SCHEDULE === '1') return

    // BullMQ é o caminho primário de despacho. O cron existe apenas como
    // fallback quando Redis/fila estão indisponíveis; executar os dois ao
    // mesmo tempo abre uma janela para envio duplicado da mesma mensagem.
    if (this.queueService.isEnabled()) return

    const workerId = `api-${process.pid}`

    try {
      const claimed = await this.whatsApp.claimQueued({ limit: 50, workerId })
      if (claimed.length === 0) return

      this.logger.log(
        `dispatching ${claimed.length} whatsapp message(s) worker=${workerId}`,
      )

      for (const message of claimed) {
        try {
          const result = await this.provider.sendText({
            toPhone: message.toPhone,
            text: message.content ?? message.renderedText,
          })

          if (!isWhatsAppSendError(result)) {
            await this.whatsApp.markSent({
              id: message.id,
              provider: result.provider,
              providerMessageId: result.providerMessageId,
            })
            continue
          }

          if (isFatalWhatsAppSendError(result)) {
            await this.whatsApp.markFailedTerminal({
              id: message.id,
              provider: result.provider,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
            })
            continue
          }

          await this.whatsApp.markFailedAndRequeue({
            id: message.id,
            provider: result.provider,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          })
        } catch (error: any) {
          await this.whatsApp.markFailedAndRequeue({
            id: message.id,
            provider: 'internal',
            errorCode: 'UNEXPECTED',
            errorMessage: error?.message ?? 'unexpected error',
          })
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `dispatchQueued failed worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
      )
    }
  }
}
