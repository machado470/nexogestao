import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto'

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getOrganizationSettings(orgId: string) {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          currency: true,
        },
      })

      if (!organization) {
        throw new NotFoundException('Organização não encontrada.')
      }

      return {
        ...organization,
        currentPlan: 'Nenhum',
        membersCount: 0,
      }
    } catch (error) {
      this.logger.error(
        `Erro ao buscar configurações da organização ${orgId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error
    }
  }

  async getAdministrativeSummary(orgId: string) {
    const now = new Date()
    const [organization, users] = await this.prisma.$transaction([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, timezone: true, currency: true, createdAt: true, executionConfig: { select: { mode: true, policy: true, updatedAt: true } } },
      }),
      this.prisma.user.findMany({
        where: { orgId },
        select: { id: true, email: true, role: true, active: true, inviteExpiresAt: true, createdAt: true, person: { select: { name: true } } },
      }),
    ])
    if (!organization) throw new NotFoundException('Organização não encontrada.')

    const members = users.filter((user) => user.active)
    const invites = users.filter((user) => !user.active && user.inviteExpiresAt && user.inviteExpiresAt > now)
    const admins = members.filter((user) => user.role === 'ADMIN')
    const identityReady = organization.name.trim().length > 0
    const timezoneReady = organization.timezone.trim().length > 0
    const policyReady = Boolean(organization.executionConfig?.policy && typeof organization.executionConfig.policy === 'object' && Object.keys(organization.executionConfig.policy as object).length)
    type State = 'CONFIGURED' | 'INCOMPLETE' | 'NOT_CONFIGURED' | 'NOT_EVALUATED'
    const section = (key: string, label: string, state: State, reason: string, target: string | null, evidence: Array<{ key: string; value: string | number | boolean | null }>) => ({ key, label, state, available: true, reason, target, evidence })
    const sections = [
      section('company', 'Empresa', identityReady && timezoneReady ? 'CONFIGURED' : 'INCOMPLETE', identityReady && timezoneReady ? 'Identidade e fuso persistidos.' : 'Identidade ou fuso persistido está ausente.', '/settings#settings-company-form', [{ key: 'namePersisted', value: identityReady }, { key: 'timezonePersisted', value: timezoneReady }]),
      section('permissions', 'Usuários e permissões', admins.length ? 'CONFIGURED' : 'INCOMPLETE', admins.length ? 'Há administrador ativo no tenant.' : 'Nenhum administrador ativo foi confirmado.', '/people', [{ key: 'activeMembers', value: members.length }, { key: 'activeAdministrators', value: admins.length }, { key: 'pendingInvites', value: invites.length }]),
      section('operation', 'Operação', organization.executionConfig ? 'CONFIGURED' : 'NOT_CONFIGURED', organization.executionConfig ? 'Modo oficial de execução persistido.' : 'Configuração oficial de execução ausente.', '/service-orders', [{ key: 'executionMode', value: organization.executionConfig?.mode ?? null }]),
      section('finance', 'Financeiro', organization.currency ? 'CONFIGURED' : 'NOT_CONFIGURED', organization.currency ? 'Moeda operacional persistida.' : 'Moeda operacional ausente.', '/finances', [{ key: 'currency', value: organization.currency || null }]),
      section('communication', 'Comunicação', 'NOT_EVALUATED', 'Não há evidência tenant-scoped do canal de comunicação.', '/whatsapp', []),
      section('governance', 'Governança/Risco', policyReady ? 'CONFIGURED' : 'NOT_CONFIGURED', policyReady ? 'Política oficial de execução persistida.' : 'Política oficial de execução ausente.', '/governance', [{ key: 'executionPolicyPersisted', value: policyReady }]),
      section('integrations', 'Integrações', 'NOT_EVALUATED', 'Prontidão tenant-scoped de integrações não está disponível.', null, []),
      section('system', 'Sistema', timezoneReady ? 'CONFIGURED' : 'NOT_CONFIGURED', timezoneReady ? 'Fuso horário persistido.' : 'Fuso horário persistido ausente.', '/settings#settings-company-form', [{ key: 'timezone', value: organization.timezone || null }]),
    ]
    const pending = sections.filter((item) => item.state !== 'CONFIGURED').map((item) => ({ key: item.key, label: item.label, state: item.state, reason: item.reason, target: item.target, recommendedAction: item.state === 'NOT_EVALUATED' ? 'Revisar disponibilidade' : `Configurar ${item.label.toLowerCase()}` }))
    return {
      version: '2026-08-30', evaluatedAt: now.toISOString(),
      organization: { id: organization.id, name: organization.name, timezone: organization.timezone, currency: organization.currency, updatedAt: organization.createdAt },
      sections, pending,
      integrations: { available: false, state: 'NOT_EVALUATED' as const, reason: 'Prontidão tenant-scoped não disponível.' },
      access: { available: true, activeMembers: members.map(({ inviteExpiresAt: _ignored, ...user }) => user), pendingInvites: invites, activeMemberCount: members.length, pendingInviteCount: invites.length, activeAdministratorCount: admins.length },
    }
  }

  async updateOrganizationSettings(
    orgId: string,
    data: UpdateOrganizationSettingsDto,
  ) {
    try {
      const organization = await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          currency: true,
        },
      })

      return {
        ...organization,
        currentPlan: 'Nenhum',
        membersCount: 0,
      }
    } catch (error) {
      this.logger.error(
        `Erro ao atualizar configurações da organização ${orgId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error
    }
  }
}
