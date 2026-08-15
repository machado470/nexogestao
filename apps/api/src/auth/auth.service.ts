import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import { Resend } from 'resend'
import { v4 as uuidv4 } from 'uuid'

import { AnalyticsService, UsageMetricEvent } from '../analytics/analytics.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly resend: Resend | null = null
  private readonly enforceEmailVerification: boolean
  private readonly emailVerificationBypass = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
  ) {
    const resendApiKey = this.config.get<string>('RESEND_API_KEY')

    if (resendApiKey && resendApiKey.trim().length > 0) {
      this.resend = new Resend(resendApiKey)
    } else {
      this.logger.warn(
        '[OPTIONAL][integration-missing-config] RESEND_API_KEY ausente. Recuperação por e-mail ficará desabilitada.',
      )
    }

    this.enforceEmailVerification = this.parseBooleanEnv(
      this.config.get<string>('AUTH_ENFORCE_EMAIL_VERIFICATION'),
      false,
    )

    const bypassEmailsRaw = this.config.get<string>(
      'AUTH_EMAIL_VERIFICATION_BYPASS_EMAILS',
    )

    if (bypassEmailsRaw) {
      for (const email of bypassEmailsRaw.split(',')) {
        const normalized = email.trim().toLowerCase()
        if (normalized) {
          this.emailVerificationBypass.add(normalized)
        }
      }
    }
  }

  private parseBooleanEnv(value: string | undefined, fallback: boolean) {
    if (typeof value !== 'string') return fallback
    const normalized = value.trim().toLowerCase()
    if (!normalized) return fallback
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized)
  }

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

  private async uniqueOrgSlug(base: string) {
    let slug = base
    let i = 0

    while (true) {
      const exists = await this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      })

      if (!exists) return slug

      i++
      slug = `${base}-${i}`
    }
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex')
  }

  createSessionPayload(user: any) {
    const token = this.jwt.sign({
      sub: user.id,
      role: user.role,
      orgId: user.orgId,
      personId: user.person?.id,
    })

    return {
      token,
      user: {
        id: user.id,
        role: user.role,
        orgId: user.orgId,
        personId: user.person?.id,
      },
    }
  }

  async register(params: {
    orgName: string
    adminName: string
    email: string
    password: string
  }) {
    const orgName = (params.orgName ?? '').trim()
    const adminName = (params.adminName ?? '').trim()
    const email = (params.email ?? '').trim().toLowerCase()
    const password = params.password ?? ''

    if (!orgName) {
      throw new BadRequestException('Nome da empresa é obrigatório')
    }

    if (!adminName) {
      throw new BadRequestException('Nome do administrador é obrigatório')
    }

    if (!email) {
      throw new BadRequestException('Email é obrigatório')
    }

    if (password.length < 8) {
      throw new BadRequestException('A senha precisa ter ao menos 8 caracteres')
    }

    const emailInUse = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (emailInUse) {
      throw new ConflictException('Email já cadastrado')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const baseSlug = this.slugify(orgName)
    const slug = await this.uniqueOrgSlug(baseSlug)

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          requiresOnboarding: true,
        },
      })

      return tx.user.create({
        data: {
          email,
          password: passwordHash,
          role: 'ADMIN',
          active: true,
          emailVerifiedAt: null,
          orgId: org.id,
          person: {
            create: {
              name: adminName,
              email,
              role: 'ADMIN',
              active: true,
              orgId: org.id,
            },
          },
        },
        include: {
          person: true,
        },
      })
    })

    let verificationEmailStatus: 'sent' | 'failed' | 'provider_unavailable' =
      'provider_unavailable'

    try {
      await this.sendVerificationEmail(createdUser.id, email)
      verificationEmailStatus = this.resend ? 'sent' : 'provider_unavailable'
    } catch (error) {
      verificationEmailStatus = 'failed'
      this.logger.warn(
        `Falha ao enviar verificação de e-mail: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    const canAutoLogin = !this.enforceEmailVerification
    const sessionPayload = canAutoLogin
      ? this.createSessionPayload(createdUser)
      : undefined

    const verificationMessageByStatus = {
      sent: 'Enviamos um link de confirmação para seu e-mail. Verifique sua caixa de entrada para liberar o login.',
      failed:
        'Conta criada, mas houve falha ao enviar o e-mail de confirmação. Use o login para solicitar um novo link.',
      provider_unavailable:
        'Conta criada. Este ambiente está sem provedor de e-mail; no login você poderá solicitar novo link quando o serviço estiver ativo.',
    } as const

    return {
      success: true,
      message: canAutoLogin
        ? 'Conta criada com sucesso.'
        : verificationMessageByStatus[verificationEmailStatus],
      requiresEmailVerification: true,
      emailVerificationStatus: verificationEmailStatus,
      rollout: {
        emailVerificationEnforced: this.enforceEmailVerification,
        canAutoLogin,
      },
      ...(sessionPayload ? sessionPayload : {}),
    }
  }

  async loginWithGoogleProfile(googleUser: {
    email: string
    firstName?: string
    lastName?: string
    sub?: string
    picture?: string
    emailVerified?: boolean
  }) {
    const email = (googleUser.email ?? '').trim().toLowerCase()

    if (!email) {
      throw new BadRequestException('Email Google é obrigatório')
    }

    if (googleUser.emailVerified === false) {
      throw new UnauthorizedException('Conta Google sem e-mail verificado')
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { person: true },
    })

    if (!user) {
      throw new UnauthorizedException(
        'Nenhuma conta encontrada para este e-mail. Solicite acesso ao administrador.',
      )
    }

    if (!user.person) {
      const displayName =
        `${googleUser.firstName ?? ''} ${googleUser.lastName ?? ''}`.trim() ||
        email

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          person: {
            create: {
              name: displayName,
              email,
              role: user.role,
              active: true,
              orgId: user.orgId,
            },
          },
        },
        include: { person: true },
      })
    }

    if (!user.emailVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerifyTokenHash: null,
          emailVerifyTokenExpiresAt: null,
        },
        include: { person: true },
      })
    }

    return this.createSessionPayload(user)
  }

  async validateGoogleUser(googleUser: any) {
    const email = (googleUser?.email ?? '').trim().toLowerCase()

    if (!email) {
      throw new UnauthorizedException('Usuário Google inválido')
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { person: true },
    })

    if (!user) {
      throw new UnauthorizedException(
        'Nenhuma conta encontrada para este e-mail. Solicite acesso ao administrador.',
      )
    }

    if (!user.active) {
      throw new UnauthorizedException('Conta não ativada')
    }

    if (!user.person || !user.person.active) {
      throw new UnauthorizedException('Usuário sem identidade operacional ativa')
    }

    return this.createSessionPayload(user)
  }

  async forgotPassword(email: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase()

    if (!normalizedEmail) {
      throw new BadRequestException('Email é obrigatório')
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user) {
      return {
        success: true,
        message: 'Se o e-mail existir, um link de recuperação será enviado.',
      }
    }

    if (!this.resend) {
      throw new ServiceUnavailableException(
        'Recuperação de senha por e-mail não está disponível no momento.',
      )
    }

    const rawToken = uuidv4()
    const tokenHash = this.hashToken(rawToken)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1)

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3010'
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: tokenHash,
        resetTokenExpiresAt: expiresAt,
      },
    })

    try {
      await this.resend.emails.send({
        from: this.config.get<string>('EMAIL_FROM') || 'onboarding@resend.dev',
        to: normalizedEmail,
        subject: 'Recuperação de Senha - NexoGestao',
        html: `<p>Você solicitou a recuperação de senha. Clique no link abaixo para redefinir:</p><a href="${resetLink}">${resetLink}</a><p>Este link expira em 1 hora.</p>`,
      })
    } catch (error) {
      this.logger.error(
        `Erro ao enviar e-mail de recuperação: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )

      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail de recuperação no momento.',
      )
    }

    return {
      success: true,
      message: 'Se o e-mail existir, um link de recuperação será enviado.',
    }
  }

  async resetPassword(token: string, password: string) {
    const normalizedToken = (token ?? '').trim()

    if (!normalizedToken) {
      throw new BadRequestException('Token é obrigatório')
    }

    if (!password || password.length < 8) {
      throw new BadRequestException('A senha precisa ter ao menos 8 caracteres')
    }

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: this.hashToken(normalizedToken),
        resetTokenExpiresAt: {
          gt: new Date(),
        },
      },
    })

    if (!user) {
      throw new UnauthorizedException('Token inválido ou expirado')
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    })

    return {
      success: true,
      message: 'Senha redefinida com sucesso.',
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase()

    if (!normalizedEmail) {
      throw new BadRequestException('Email é obrigatório')
    }

    if (!password) {
      throw new BadRequestException('Senha é obrigatória')
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { person: true },
    })

    if (!user || !user.password) {
      throw new UnauthorizedException('Usuário inválido')
    }

    if (!user.active) {
      throw new UnauthorizedException('Conta não ativada')
    }

    if (!user.person) {
      throw new UnauthorizedException('Usuário sem identidade operacional')
    }

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      throw new UnauthorizedException('Senha inválida')
    }

    const bypassEmailVerification =
      !this.enforceEmailVerification ||
      this.emailVerificationBypass.has(normalizedEmail)

    if (!user.emailVerifiedAt && !bypassEmailVerification) {
      throw new UnauthorizedException({
        message:
          'E-mail ainda não verificado. Confirme seu e-mail para concluir o login.',
        code: 'EMAIL_NOT_VERIFIED',
        canResendVerification: true,
        email: normalizedEmail,
      })
    }

    const result = this.createSessionPayload(user)

    try {
      const loginEvent = (UsageMetricEvent as any)?.LOGIN ?? 'LOGIN'

      await this.analytics.track({
        orgId: user.orgId,
        userId: user.id,
        event: loginEvent as any,
        metadata: { role: user.role },
      })
    } catch (error) {
      this.logger.warn(
        `Falha ao registrar analytics de login: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    return {
      success: true,
      message: 'Login efetuado com sucesso.',
      requiresEmailVerification: !user.emailVerifiedAt,
      emailVerificationBypassApplied:
        !user.emailVerifiedAt && bypassEmailVerification,
      ...result,
    }
  }

  async verifyEmail(rawToken: string) {
    const token = (rawToken ?? '').trim()
    if (!token) {
      throw new BadRequestException('Token é obrigatório')
    }

    const tokenHash = this.hashToken(token)
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyTokenHash: tokenHash,
        emailVerifyTokenExpiresAt: {
          gt: new Date(),
        },
      },
    })

    if (!user) {
      throw new UnauthorizedException('Token inválido ou expirado')
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyTokenExpiresAt: null,
      },
    })

    return {
      success: true,
      message: 'E-mail confirmado com sucesso.',
    }
  }

  async resendEmailVerification(email: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase()
    if (!normalizedEmail) {
      throw new BadRequestException('Email é obrigatório')
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerifiedAt: true },
    })

    if (!user || user.emailVerifiedAt) {
      return {
        success: true,
        message: 'Se o e-mail existir, um novo link de verificação será enviado.',
      }
    }

    await this.sendVerificationEmail(user.id, normalizedEmail)

    return {
      success: true,
      message: 'Se o e-mail existir, um novo link de verificação será enviado.',
    }
  }

  async sendVerificationEmail(userId: string, email: string) {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY ausente. Verificação de e-mail não enviada para ${email}.`,
      )
      return
    }

    const rawToken = uuidv4()
    const tokenHash = this.hashToken(rawToken)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyTokenHash: tokenHash,
        emailVerifyTokenExpiresAt: expiresAt,
      },
    })

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3010'
    const verifyLink = `${frontendUrl}/auth/confirm-email?token=${rawToken}`

    await this.resend.emails.send({
      from: this.config.get<string>('EMAIL_FROM') || 'onboarding@resend.dev',
      to: email,
      subject: 'Confirme seu e-mail - NexoGestao',
      html: `<p>Confirme seu e-mail para proteger sua conta:</p><a href="${verifyLink}">${verifyLink}</a><p>Este link expira em 24 horas.</p>`,
    })
  }
}
