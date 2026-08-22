import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common'
import { Roles } from '../auth/decorators/roles.decorator'
import { ActiveUserGuard } from '../auth/guards/active-user.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ForceNormalService } from './force-normal.service'

@Controller('admin/operational-state')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles('ADMIN')
export class OperationalStateController {
  constructor(private readonly forceNormalService: ForceNormalService) {}

  @Post(':personId/force-normal')
  async forceNormal(@Req() req: any, @Param('personId') personId: string) {
    await this.forceNormalService.execute({
      orgId: req.user.orgId,
      actorUserId: req.user.sub,
      personId,
    })

    return {
      success: true,
      message: 'Estado operacional liberado por override administrativo',
    }
  }
}
