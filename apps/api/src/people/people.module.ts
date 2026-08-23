import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TimelineModule } from '../timeline/timeline.module'
import { AuditModule } from '../audit/audit.module'
import { RiskModule } from '../risk/risk.module'
import {
  OperationalStateModule,
} from './operational-state.module'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

import { PeopleService } from './people.service'
import { PeopleController } from './people.controller'
import {
  PeopleOperationalSummaryService,
} from './people-operational-summary.service'
import {
  PersonAvailabilityExceptionsService,
} from './person-availability-exceptions.service'

@Module({
  imports: [
    PrismaModule,
    TimelineModule,
    AuditModule,
    RiskModule,
    OperationalStateModule,
  ],
  providers: [
    PeopleService,
    PeopleOperationalSummaryService,
    PersonAvailabilityExceptionsService,
    ActiveUserGuard,
  ],
  controllers: [
    PeopleController,
  ],
  exports: [
    PeopleService,

    /*
     * Reexporta a autoridade única.
     *
     * ServiceOrders continua importando
     * PeopleModule, mas recebe exatamente
     * o provider do OperationalStateModule.
     */
    OperationalStateModule,
  ],
})
export class PeopleModule {}
