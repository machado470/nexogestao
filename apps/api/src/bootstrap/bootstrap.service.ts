import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'

const BOOTSTRAP_FIRST_ADMIN_LOCK_KEY =
  'nexogestao:bootstrap:first-admin'

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private slugify(input: string) {
    const s = (input ?? '').trim().toLowerCase()
    const normalized = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')

    return normalized || 'org'
  }

  private async uniqueOrgSlug(
    tx: Prisma.TransactionClient,
    base: string,
  ) {
    let slug = base
    let i = 0

    while (true) {
      const exists = await tx.organization.findUnique({
        where: { slug },
        select: { id: true },
      })

      if (!exists) return slug

      i++
      slug = `${base}-${i}`
    }
  }

  private async validateBootstrapAuthorization(
    tx: Prisma.TransactionClient,
    secretFromHeader?: string,
  ) {
    const usersCount = await tx.user.count()
    const configuredSecret =
      process.env.BOOTSTRAP_SECRET?.trim()
    const isProduction =
      (process.env.NODE_ENV ?? '')
        .trim()
        .toLowerCase() === 'production'

    if (usersCount === 0 && !isProduction) {
      return
    }

    if (!configuredSecret) {
      throw new ForbiddenException(
        'Bootstrap protegido. Configure BOOTSTRAP_SECRET para uso administrativo.',
      )
    }

    if (!secretFromHeader || secretFromHeader.trim() !== configuredSecret) {
      throw new ForbiddenException('x-bootstrap-secret inválido.')
    }
  }

  async createFirstAdmin(
    params: {
      orgName: string
      adminName: string
      email: string
      password: string
      organizationId?: string
    },
    bootstrapSecret?: string,
  ) {
    const orgName = (params.orgName ?? '').trim()
    const adminName = (params.adminName ?? '').trim()
    const email = (params.email ?? '').trim().toLowerCase()
    const password = params.password ?? ''
    const organizationId = (params.organizationId ?? '').trim() || null

    if (!orgName && !organizationId) {
      throw new BadRequestException(
        'orgName obrigatório quando organizationId não é informado',
      )
    }

    if (!adminName) throw new BadRequestException('adminName obrigatório')
    if (!email) throw new BadRequestException('email obrigatório')
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'A senha precisa ter ao menos 8 caracteres',
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT 1::int AS "locked"
          FROM pg_advisory_xact_lock(
            hashtextextended(${BOOTSTRAP_FIRST_ADMIN_LOCK_KEY}, 0)
          )
        `,
      )

      await this.validateBootstrapAuthorization(
        tx,
        bootstrapSecret,
      )

      const emailInUse = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      })

      if (emailInUse) {
        throw new ConflictException('Email já cadastrado')
      }

      let org = null as Awaited<ReturnType<typeof tx.organization.findUnique>>

      if (organizationId) {
        org = await tx.organization.findUnique({ where: { id: organizationId } })
        if (!org) {
          throw new BadRequestException('organizationId inválido')
        }
      } else {
        org = await tx.organization.findUnique({ where: { slug: 'default' } })

        if (org) {
          org = await tx.organization.update({
            where: { id: org.id },
            data: {
              name: orgName || org.name,
              requiresOnboarding: false,
            },
          })
        } else {
          const baseSlug = this.slugify(orgName)
          const slug = await this.uniqueOrgSlug(tx, baseSlug)

          org = await tx.organization.create({
            data: {
              name: orgName,
              slug,
              requiresOnboarding: false,
            },
          })

          await this.subscriptionsService.createTrialSubscription(org.id, tx)
        }
      }

      const existingAdmin = await tx.user.findFirst({
        where: { role: 'ADMIN', orgId: org.id },
        select: { id: true },
      })

      if (existingAdmin) {
        throw new ConflictException('Organização já possui ADMIN')
      }

      const user = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          role: 'ADMIN',
          active: true,
          emailVerifiedAt: new Date(),
          orgId: org.id,
        },
      })

      const person = await tx.person.create({
        data: {
          name: adminName,
          email,
          role: 'ADMIN',
          active: true,
          orgId: org.id,
          userId: user.id,
        },
      })

      return { org, user, person }
    })

    return {
      success: true,
      orgId: created.org.id,
      userId: created.user.id,
      personId: created.person.id,
    }
  }
}
