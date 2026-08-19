// apps/api/src/whatsapp/whatsapp.dispatcher.job.ts

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { randomUUID } from 'node:crypto'
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

  constructor(private readonly whatsApp: WhatsAppService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchQueued() {
    if (process.env.DISABLE_WHATSAPP_SCHEDULE === '1') return

    const maxMessagesPerRun = 50

    for (let processed = 0; processed < maxMessagesPerRun; processed += 1) {
      const workerId = `cron-${process.pid}-${randomUUID()}`

      try {
        const claimed = await this.whatsApp.claimQueued({
          limit: 1,
          workerId,
        })

        const message = claimed[0]
        if (!message) return

        this.logger.log(
          `dispatching whatsapp message=${message.id} worker=${workerId}`,
        )

        try {
          const result = await this.provider.sendText({
            toPhone: message.toPhone,
            text: message.content ?? message.renderedText,
          })

          if (!isWhatsAppSendError(result)) {
            await this.whatsApp.markSent({
              id: message.id,
              orgId: message.orgId,
              workerId,
              provider: result.provider,
              providerMessageId: result.providerMessageId,
            })
            continue
          }

          if (isFatalWhatsAppSendError(result)) {
            await this.whatsApp.markFailedTerminal({
              id: message.id,
              orgId: message.orgId,
              workerId,
              provider: result.provider,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
            })
            continue
          }

          await this.whatsApp.markFailedAndRequeue({
            id: message.id,
            orgId: message.orgId,
            workerId,
            provider: result.provider,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          })

          // Não permite que o mesmo cron recapture imediatamente
          // a mensagem que acabou de voltar para QUEUED.
          return
        } catch (error: any) {
          await this.whatsApp.markFailedAndRequeue({
            id: message.id,
            orgId: message.orgId,
            workerId,
            provider: 'internal',
            errorCode: 'UNEXPECTED',
            errorMessage: error?.message ?? 'unexpected error',
          })

          // Evita loop de retry imediato dentro da mesma execução.
          return
        }
      } catch (error: any) {
        this.logger.warn(
          `dispatchQueued failed worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
        )
        return
      }
    }
  }

}
