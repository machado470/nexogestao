import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TimelineModule } from '../timeline/timeline.module'
import { FinanceModule } from '../finance/finance.module'
import { ServiceOrdersModule } from '../service-orders/service-orders.module'

import { GovernanceRunService } from './governance-run.service'
import { GovernanceRunJob } from './governance-run.job'

import { EnforcementPolicyService } from './enforcement-policy.service'
import { EnforcementEngineService } from './enforcement-engine.service'
import { EnforcementJob } from './enforcement.job'
import { EnforcementController } from './enforcement.controller'

// Leitura de dados de governança — controller e service existiam mas não estavam registrados
import { GovernanceReadController } from './governance-read.controller'
import { GovernanceReadService } from './governance-read.service'
import { GovernanceActionController } from './governance-action.controller'
import { GovernanceActionService } from './governance-action.service'
import { OperationalStateRepository } from '../people/operational-state.repository'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'

@Module({
  imports: [
    PrismaModule,
    TimelineModule,
    FinanceModule,
    ServiceOrdersModule,
  ],
  controllers: [
    EnforcementController,
    GovernanceReadController,
    GovernanceActionController,
  ],
  providers: [
    GovernanceRunService,
    GovernanceRunJob,

    EnforcementPolicyService,
    EnforcementEngineService,
    EnforcementJob,

    GovernanceReadService,
    GovernanceActionService,
    OperationalStateRepository,
    ActiveUserGuard,
    RolesGuard,
  ],
  exports: [
    GovernanceRunService,
    GovernanceRunJob,

    EnforcementPolicyService,
    EnforcementEngineService,
    EnforcementJob,

    GovernanceReadService,
    GovernanceActionService,
  ],
})
export class GovernanceModule {}
