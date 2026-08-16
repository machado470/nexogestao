import { Module } from '@nestjs/common'
import { OperationalActionsController } from './operational-actions.controller'
import { OperationalActionsService } from './operational-actions.service'
import { PrismaModule } from '../prisma/prisma.module'
import { TimelineModule } from '../timeline/timeline.module'
import { WhatsAppModule } from '../whatsapp/whatsapp.module'
import { FinanceModule } from '../finance/finance.module'
import { RiskModule } from '../risk/risk.module'
import { GovernanceModule } from '../governance/governance.module'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'

@Module({
  imports: [PrismaModule, TimelineModule, WhatsAppModule, FinanceModule, RiskModule, GovernanceModule],
  controllers: [OperationalActionsController],
  providers: [OperationalActionsService, ActiveUserGuard],
})
export class OperationalActionsModule {}
