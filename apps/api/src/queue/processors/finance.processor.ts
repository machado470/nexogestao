import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { FinanceService } from '../../finance/finance.service'
import { QUEUE_CONNECTION, QUEUE_DEFAULT_WORKER_OPTIONS, QUEUE_NAMES } from '../queue.constants'
import { QueueService } from '../queue.service'

@Injectable()
export class FinanceProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceProcessor.name)
  private worker?: Worker

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly financeService: FinanceService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    try {
      this.worker = new Worker(
        QUEUE_NAMES.FINANCE,
        async (job: Job<any>) => {
          await this.queueService.updateJobStatus({
            queue: QUEUE_NAMES.FINANCE,
            jobId: job.id?.toString() ?? '',
            status: 'ACTIVE',
          })

          if (job.name === 'create-charge') {
            await this.financeService.createAutomationCharge(job.data)
          }

          if (job.name === 'payment-reminder') {
            await this.financeService.sendPaymentReminder(job.data)
            if (job.data.chargeId) {
              await this.financeService.sendPaymentReminderWhatsApp(job.data.chargeId)
            }
          }

          await this.queueService.updateJobStatus({
            queue: QUEUE_NAMES.FINANCE,
            jobId: job.id?.toString() ?? '',
            status: 'COMPLETED',
            completed: true,
          })
        },
        { connection: this.connection, ...QUEUE_DEFAULT_WORKER_OPTIONS },
      )

      this.worker.on('error', (error) => {
        this.logger.error(`Finance worker error: ${error.message}`)
      })

      this.logger.log('Finance worker iniciado')
    } catch (err) {
      const error = err as Error
      this.logger.error(`Falha ao iniciar finance worker: ${error.message}`)
    }
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close()
    } catch (err) {
      const error = err as Error
      this.logger.error(`Erro ao fechar finance worker: ${error.message}`)
    }
  }
}
