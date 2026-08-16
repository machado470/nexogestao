import { Module } from '@nestjs/common'
import { QueueModule } from '../queue/queue.module'
import { PrismaModule } from '../prisma/prisma.module'
import { WebhookService } from './webhook.service'
import { WebhookController } from './webhook.controller'
import { WebhookDispatcher } from './webhook.dispatcher'
import { WebhookProcessor } from '../queue/processors/webhook.processor'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookDispatcher, WebhookProcessor, ActiveUserGuard],
  exports: [WebhookService, WebhookDispatcher],
})
export class WebhookModule {}
