import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { QUEUE_CONNECTION, QUEUE_NAMES } from '../queue.constants'
import { QueueService } from '../queue.service'

@Injectable()
export class WhatsAppDlqProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppDlqProcessor.name)
  private worker?: Worker

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    try {
      this.worker = new Worker(
        QUEUE_NAMES.WHATSAPP_DLQ,
        async (job: Job<any>) => {
          this.logger.error(
            `DLQ whatsapp payload=${JSON.stringify(job.data?.payload ?? {})} error=${job.data?.error ?? 'unknown'} attemptsMade=${job.data?.attemptsMade ?? 0} requestId=${job.data?.requestId ?? 'n/a'} userId=${job.data?.userId ?? 'n/a'} orgId=${job.data?.orgId ?? 'n/a'}`,
          )
        },
        {
          connection: this.connection,
          concurrency: 2,
        },
      )

      this.worker.on('error', (error) => {
        this.logger.error(`WhatsApp DLQ worker error: ${error.message}`)
      })

      this.logger.log('WhatsApp DLQ worker iniciado')
    } catch (error) {
      const err = error as Error
      this.logger.error(`Falha ao iniciar whatsapp DLQ worker: ${err.message}`)
    }
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close()
    } catch (error) {
      const err = error as Error
      this.logger.error(`Erro ao fechar whatsapp DLQ worker: ${err.message}`)
    }
  }
}
