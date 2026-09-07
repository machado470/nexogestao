import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Org } from '../auth/decorators/org.decorator'
import { User } from '../auth/decorators/user.decorator'
import { ExecutionService } from './execution.service'
import { Throttle } from '@nestjs/throttler'
import { ExecutionRunner } from './execution.runner'
import { ExecutionEventsService } from './execution.events'
import { ExecutionConfigService } from './execution.config'
import type { ExecutionMode, ExecutionPolicyConfig } from './execution.types'
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger'
import { ExecutionResponseDto, StartExecutionDto } from './dto/start-execution.dto'
import { CompleteExecutionDto } from './dto/complete-execution.dto'

const VALID_MODES = new Set<ExecutionMode>(['manual', 'semi_automatic', 'automatic'])

function sanitizePolicyPatch(policy: unknown): Partial<ExecutionPolicyConfig> {
  if (!policy || typeof policy !== 'object') {
    throw new BadRequestException('Policy inválida')
  }

  const input = policy as Record<string, unknown>
  const result: Partial<ExecutionPolicyConfig> = {}

  if (input.allowAutomaticCharge !== undefined) {
    if (typeof input.allowAutomaticCharge !== 'boolean') {
      throw new BadRequestException('allowAutomaticCharge deve ser boolean')
    }
    result.allowAutomaticCharge = input.allowAutomaticCharge
  }

  if (input.allowWhatsAppAuto !== undefined) {
    if (typeof input.allowWhatsAppAuto !== 'boolean') {
      throw new BadRequestException('allowWhatsAppAuto deve ser boolean')
    }
    result.allowWhatsAppAuto = input.allowWhatsAppAuto
  }

  if (input.allowOverdueReminderAuto !== undefined) {
    if (typeof input.allowOverdueReminderAuto !== 'boolean') {
      throw new BadRequestException('allowOverdueReminderAuto deve ser boolean')
    }
    result.allowOverdueReminderAuto = input.allowOverdueReminderAuto
  }

  if (input.allowFinanceTeamNotifications !== undefined) {
    if (typeof input.allowFinanceTeamNotifications !== 'boolean') {
      throw new BadRequestException('allowFinanceTeamNotifications deve ser boolean')
    }
    result.allowFinanceTeamNotifications = input.allowFinanceTeamNotifications
  }

  if (input.allowGovernanceFollowup !== undefined) {
    if (typeof input.allowGovernanceFollowup !== 'boolean') {
      throw new BadRequestException('allowGovernanceFollowup deve ser boolean')
    }
    result.allowGovernanceFollowup = input.allowGovernanceFollowup
  }
  if (input.allowChargeFollowupCreation !== undefined) {
    if (typeof input.allowChargeFollowupCreation !== 'boolean') {
      throw new BadRequestException('allowChargeFollowupCreation deve ser boolean')
    }
    result.allowChargeFollowupCreation = input.allowChargeFollowupCreation
  }
  if (input.allowRiskReviewEscalation !== undefined) {
    if (typeof input.allowRiskReviewEscalation !== 'boolean') {
      throw new BadRequestException('allowRiskReviewEscalation deve ser boolean')
    }
    result.allowRiskReviewEscalation = input.allowRiskReviewEscalation
  }

  if (input.maxRetries !== undefined) {
    if (!Number.isInteger(input.maxRetries) || Number(input.maxRetries) < 0 || Number(input.maxRetries) > 20) {
      throw new BadRequestException('maxRetries deve ser inteiro entre 0 e 20')
    }
    result.maxRetries = Number(input.maxRetries)
  }

  if (input.throttleWindowMs !== undefined) {
    const numeric = Number(input.throttleWindowMs)
    if (!Number.isInteger(numeric) || numeric < 5_000 || numeric > 1000 * 60 * 60 * 24) {
      throw new BadRequestException('throttleWindowMs deve ser inteiro entre 5000 e 86400000')
    }
    result.throttleWindowMs = numeric
  }

  if (Object.keys(result).length === 0) {
    throw new BadRequestException('Nenhum campo válido enviado para policy')
  }

  return result
}

@Controller('executions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExecutionController {
  constructor(
    private readonly execution: ExecutionService,
    private readonly runner: ExecutionRunner,
    private readonly executionEvents: ExecutionEventsService,
    private readonly config: ExecutionConfigService,
  ) {}

  @Get('service-order/:serviceOrderId')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  listByServiceOrder(@Org() orgId: string, @Param('serviceOrderId') serviceOrderId: string) {
    return this.execution.listByServiceOrder(orgId, serviceOrderId)
  }

  @Post('start')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  @ApiBody({ type: StartExecutionDto })
  @ApiCreatedResponse({ type: ExecutionResponseDto })
  start(@Org() orgId: string, @User() user: any, @Body() body: StartExecutionDto) {
    return this.execution.start({ orgId, serviceOrderId: body.serviceOrderId, notes: body.notes, checklist: body.checklist, attachments: body.attachments, executorPersonId: user?.personId ?? null })
  }

  @Post(':id/complete')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  @ApiBody({ type: CompleteExecutionDto })
  @ApiCreatedResponse({ type: ExecutionResponseDto })
  complete(@Org() orgId: string, @Param('id') id: string, @Body() body: CompleteExecutionDto) {
    return this.execution.complete({ orgId, executionId: id, notes: body.notes, checklist: body.checklist, attachments: body.attachments })
  }

  @Get('state-summary')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  stateSummary(@Org() orgId: string, @Query('sinceMs') sinceMs?: string) {
    const normalizedSinceMs = Number(sinceMs ?? 1000 * 60 * 60 * 24)
    return this.executionEvents.getStateSummary(orgId, Number.isFinite(normalizedSinceMs) ? normalizedSinceMs : undefined)
  }

  @Get('mode')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  async mode(@Org() orgId: string) {
    return {
      mode: await this.config.getExecutionMode({ orgId }),
      policy: await this.config.getPolicyConfig({ orgId }),
    }
  }

  @Post('mode')
  @Roles('ADMIN', 'MANAGER')
  async updateMode(
    @Org() orgId: string,
    @User() user: any,
    @Body() body: { mode?: ExecutionMode; policy?: Partial<ExecutionPolicyConfig>; resetToDefault?: boolean },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload inválido para atualização de execution mode/policy')
    }

    if (body.mode !== undefined && !VALID_MODES.has(body.mode)) {
      throw new BadRequestException('mode inválido')
    }

    let modeChange: { before: ExecutionMode; after: ExecutionMode } | null = null
    let policyChange:
      | {
          before: ExecutionPolicyConfig
          after: ExecutionPolicyConfig
          persistedOverride: Partial<ExecutionPolicyConfig>
        }
      | null = null

    if (body?.mode) {
      modeChange = await this.config.setExecutionModeForOrg(orgId, body.mode)
    } else if (body?.resetToDefault) {
      modeChange = await this.config.setExecutionModeForOrg(orgId, this.config.getDefaultMode())
    }

    if (body?.policy !== undefined) {
      const sanitized = sanitizePolicyPatch(body.policy)
      policyChange = await this.config.setPolicyOverrideForOrg(orgId, sanitized)
    }

    if (modeChange || policyChange) {
      await this.config.recordConfigHistory({
        orgId,
        actorUserId: typeof user?.id === 'string' ? user.id : null,
        actorEmail: typeof user?.email === 'string' ? user.email : null,
        source: 'execution.mode.update',
        context: body?.resetToDefault ? 'reset_to_default' : 'manual_update',
        before: {
          mode: modeChange?.before,
          policy: policyChange?.before,
        },
        after: {
          mode: modeChange?.after,
          policy: policyChange?.after,
          persistedPolicyOverride: policyChange?.persistedOverride,
        },
      })
    }

    return {
      ok: true,
      mode: await this.config.getExecutionMode({ orgId }),
      policy: await this.config.getPolicyConfig({ orgId }),
    }
  }

  @Get('mode-history')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  listModeHistory(@Org() orgId: string, @Query('limit') limit?: string) {
    const normalizedLimit = Number(limit ?? 20)
    return this.config.listConfigHistory(orgId, Number.isFinite(normalizedLimit) ? normalizedLimit : 20)
  }

  @Get('events')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  listEvents(
    @Org() orgId: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('actionId') actionId?: string,
    @Query('entityType') entityType?: string,
  ) {
    const normalizedLimit = Number(limit ?? 100)
    return this.executionEvents.listRecentEvents(orgId, normalizedLimit, {
      status,
      actionId,
      entityType,
    })
  }

  @Get('recent')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  listRecent(
    @Org() orgId: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedLimit = Number(limit ?? 100)
    return this.executionEvents.listRecentExecutions(orgId, Number.isFinite(normalizedLimit) ? normalizedLimit : 100)
  }

  @Post('runner/run-once')
  @Roles('ADMIN', 'MANAGER')
  runOnce(
    @Query('debug') debug?: string,
    @Query('overrideCooldown') overrideCooldown?: string,
  ) {
    return this.runner.runOnce({
      debugExecution: debug === 'execution',
      overrideCooldown: overrideCooldown === '1' || overrideCooldown === 'true',
    })
  }
}
