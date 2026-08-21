import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { NotificationsService } from '../../notifications/notifications.service'
import { QUEUE_CONNECTION, QUEUE_DEFAULT_WORKER_OPTIONS, QUEUE_NAMES } from '../queue.constants'
import { QueueService } from '../queue.service'

@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name)
  private worker?: Worker

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly notificationsService: NotificationsService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    try {
      this.worker = new Worker(
        QUEUE_NAMES.NOTIFICATIONS,
        async (job: Job<any>) => {
          await this.queueService.updateJobStatus({
            queue: QUEUE_NAMES.NOTIFICATIONS,
            jobId: job.id?.toString() ?? '',
            status: 'ACTIVE',
          })

          await this.notificationsService.createNotificationNow(job.data)

          await this.queueService.updateJobStatus({
            queue: QUEUE_NAMES.NOTIFICATIONS,
            jobId: job.id?.toString() ?? '',
            status: 'COMPLETED',
            completed: true,
          })
        },
        { connection: this.connection, ...QUEUE_DEFAULT_WORKER_OPTIONS },
      )

      this.worker.on('error', (error) => {
        this.logger.error(`Notification worker error: ${error.message}`)
      })

      this.logger.log('Notification worker iniciado')
    } catch (err) {
      const error = err as Error
      this.logger.error(`Falha ao iniciar notification worker: ${error.message}`)
    }
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close()
    } catch (err) {
      const error = err as Error
      this.logger.error(`Erro ao fechar notification worker: ${error.message}`)
    }
  }
}
