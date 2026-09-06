import { Module } from '@nestjs/common'
import { ServiceOrdersService } from './service-orders.service'
import { ServiceOrdersController } from './service-orders.controller'
import { ServiceOrderTenantAccessGuard } from './service-order-tenant-access.guard'
import { ServiceOrderReadService } from './service-order-read.service'

import { PrismaModule } from '../prisma/prisma.module'
import { TimelineModule } from '../timeline/timeline.module'
import { AuditModule } from '../audit/audit.module'
import { PeopleModule } from '../people/people.module'
import { FinanceModule } from '../finance/finance.module'
import { AutomationModule } from '../automation/automation.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OnboardingModule } from '../onboarding/onboarding.module'
import { WhatsAppModule } from '../whatsapp/whatsapp.module'
import { QuotasModule } from '../quotas/quotas.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [
    PrismaModule,
    TimelineModule,
    AuditModule,
    PeopleModule,
    FinanceModule,
    AutomationModule,
    NotificationsModule,
    OnboardingModule,
    WhatsAppModule,
    QuotasModule,
    AnalyticsModule,
    OutboxModule,
  ],
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, ServiceOrderReadService, ServiceOrderTenantAccessGuard],
  exports: [ServiceOrdersService],
})
export class ServiceOrdersModule {}
