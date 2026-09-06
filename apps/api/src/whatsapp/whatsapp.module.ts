import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { WhatsAppService } from './whatsapp.service'
import { WhatsAppConversationReadService } from './whatsapp-conversation-read.service'
import { WhatsAppDispatcherJob } from './whatsapp.dispatcher.job'
import { WhatsAppTestController } from './whatsapp.test.controller'
import { WhatsAppController } from './whatsapp.controller'
import { QueueModule } from '../queue/queue.module'
import { WhatsAppProcessor } from '../queue/processors/whatsapp.processor'
import { WhatsAppDlqProcessor } from '../queue/processors/whatsapp-dlq.processor'
import { TimelineModule } from '../timeline/timeline.module'
import { QuotasModule } from '../quotas/quotas.module'
import { WhatsAppTemplateService } from './whatsapp-template.service'
import { WhatsAppContextService } from './whatsapp-context.service'
import { WhatsAppAutomationService } from './whatsapp-automation.service'
import { WhatsAppIntelligenceService } from './whatsapp-intelligence.service'
import { WhatsAppExecutionService } from './whatsapp-execution.service'
import { IdempotencyCacheService } from '../common/idempotency/idempotency-cache.service'
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor'
import { HealthModule } from '../health/health.module'

const testControllers = process.env.NODE_ENV === 'production' ? [] : [WhatsAppTestController]

@Module({
  imports: [PrismaModule, QueueModule, TimelineModule, QuotasModule, HealthModule],
  controllers: [...testControllers, WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppConversationReadService,
    WhatsAppTemplateService,
    WhatsAppContextService,
    WhatsAppAutomationService,
    WhatsAppIntelligenceService,
    WhatsAppExecutionService,
    WhatsAppDispatcherJob,
    WhatsAppProcessor,
    WhatsAppDlqProcessor,
    IdempotencyCacheService,
    IdempotencyInterceptor,
  ],
  exports: [WhatsAppService, WhatsAppTemplateService, WhatsAppContextService, WhatsAppAutomationService, WhatsAppIntelligenceService, WhatsAppExecutionService],
})
export class WhatsAppModule {}
