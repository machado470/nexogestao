import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/** Revalidates security-sensitive sessions against the persisted user state. */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest()?.user
    if (!user?.sub || !user?.orgId) {
      throw new ForbiddenException('Identidade autenticada incompleta.')
    }

    const activeUser = await this.prisma.user.findFirst({
      where: { id: user.sub, orgId: user.orgId, active: true },
      select: { id: true },
    })

    if (!activeUser) {
      throw new ForbiddenException('Usuário inativo ou sem acesso à organização.')
    }

    return true
  }
}
