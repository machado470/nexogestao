import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { WebhookModule } from '../webhooks/webhook.module'
import { OutboxRepository } from './outbox.repository'
import { OutboxService } from './outbox.service'
import { OutboxWorker } from './outbox.worker'

@Module({
  imports: [PrismaModule, WebhookModule],
  providers: [OutboxService, OutboxRepository, OutboxWorker],
  exports: [OutboxService, OutboxRepository],
})
export class OutboxModule {}
