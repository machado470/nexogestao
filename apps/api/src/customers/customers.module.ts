import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CustomersService } from './customers.service'
import { CustomersController } from './customers.controller'
import { CustomersOperationalSummaryService } from './customers-operational-summary.service'

import { TimelineModule } from '../timeline/timeline.module'
import { AuditModule } from '../audit/audit.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OnboardingModule } from '../onboarding/onboarding.module'
import { AnalyticsModule } from '../analytics/analytics.module'
import { QuotasModule } from '../quotas/quotas.module'

@Module({
  imports: [
    PrismaModule,
    TimelineModule,
    AuditModule,
    NotificationsModule,
    OnboardingModule,
    AnalyticsModule,
    QuotasModule,
  ],
  providers: [
    CustomersService,
    CustomersOperationalSummaryService,
  ],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
