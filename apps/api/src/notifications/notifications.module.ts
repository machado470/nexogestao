import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { AuthModule } from '../auth/auth.module'
import { QueueModule } from '../queue/queue.module'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationProcessor } from '../queue/processors/notification.processor'
import { NotificationPubSubService } from './notification-pubsub.service'
import { NotificationStreamHub } from './notification-stream-hub.service'

@Module({
  imports: [
    AuthModule,
    QueueModule,
    PrismaModule
  ],
  providers: [
    NotificationsService,
    NotificationProcessor,
    NotificationStreamHub,
    NotificationPubSubService
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
