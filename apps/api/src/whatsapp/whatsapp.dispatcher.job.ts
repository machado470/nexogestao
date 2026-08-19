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

      let message: any

      try {
        const claimed = await this.whatsApp.claimQueued({
          limit: 1,
          workerId,
        })

        message = claimed[0]
        if (!message) return
      } catch (error: any) {
        this.logger.warn(
          `whatsapp claim failed worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
        )
        return
      }

      this.logger.log(
        `dispatching whatsapp message=${message.id} worker=${workerId}`,
      )

      let result

      try {
        result = await this.provider.sendText({
          toPhone: message.toPhone,
          text: message.content ?? message.renderedText,
        })
      } catch (error: any) {
        // A chamada externa chegou a ser iniciada.
        // Não sabemos se o provider aceitou a mensagem.
        // Nunca devolver automaticamente para QUEUED.
        this.logger.error(
          `whatsapp provider result uncertain message=${message.id} worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
        )
        return
      }

      if (!isWhatsAppSendError(result)) {
        try {
          await this.whatsApp.markSent({
            id: message.id,
            orgId: message.orgId,
            workerId,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
          })
        } catch (error: any) {
          // O provider confirmou o envio, mas a persistência falhou.
          // Requeue aqui poderia duplicar a mensagem externamente.
          this.logger.error(
            `whatsapp sent persistence failed message=${message.id} worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
          )
          return
        }

        continue
      }

      if (result.ambiguous) {
        try {
          await this.whatsApp.markDeliveryUncertain({
            id: message.id,
            orgId: message.orgId,
            workerId,
            provider: result.provider,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          })
        } catch (error: any) {
          // Resultado externo incerto + falha de persistência:
          // manter SENDING para reconciliação posterior.
          this.logger.error(
            `whatsapp uncertain persistence failed message=${message.id} worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
          )
          return
        }

        continue
      }

      if (isFatalWhatsAppSendError(result)) {
        try {
          await this.whatsApp.markFailedTerminal({
            id: message.id,
            orgId: message.orgId,
            workerId,
            provider: result.provider,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          })
        } catch (error: any) {
          this.logger.error(
            `whatsapp terminal failure persistence failed message=${message.id} worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
          )
          return
        }

        continue
      }

      // Somente erro explicitamente retornado pelo provider como
      // não fatal e não ambíguo pode voltar para QUEUED.
      try {
        await this.whatsApp.markFailedAndRequeue({
          id: message.id,
          orgId: message.orgId,
          workerId,
          provider: result.provider,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        })
      } catch (error: any) {
        this.logger.warn(
          `whatsapp retryable failure persistence failed message=${message.id} worker=${workerId} err=${error?.code ?? ''} msg=${error?.message ?? error}`,
        )
      }

      // Evita recapturar imediatamente a mesma mensagem nesta execução.
      return
    }
  }

}
