import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Logger,
  HttpCode,
  Optional,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { WhatsAppConversationStatus, WhatsAppMessageStatus, WhatsAppSuggestedAction } from '@prisma/client'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { Org } from '../auth/decorators/org.decorator'
import { User } from '../auth/decorators/user.decorator'
import { IdempotencyService } from '../common/idempotency/idempotency.service'
import { QuotasService } from '../quotas/quotas.service'
import { createWhatsAppProvider, getWhatsAppProviderReadiness } from './providers/provider.factory'
import { WhatsAppService, buildDeterministicMessageKey } from './whatsapp.service'
import { WhatsAppExecutionService } from './whatsapp-execution.service'
import { ListConversationsQueryDto, ListWebhookEventsQueryDto, MessageFeedQueryDto, ReplayWebhookEventsDto, SendConversationMessageDto, SendMessageDto, SendTemplateMessageDto, UpdateConversationStatusDto, UpdateMessageStatusDto } from './dto/whatsapp.dto'
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor'

@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name)
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly quotas: QuotasService,
    private readonly idempotency: IdempotencyService,
    @Optional() private readonly executions?: WhatsAppExecutionService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List WhatsApp conversations' })
  async listConversations(@Org() orgId: string, @Query() query: ListConversationsQueryDto) {
    return this.whatsapp.listConversations(orgId, query)
  }
  @Get('inbox')
  async listInbox(@Org() orgId: string, @Query() query: ListConversationsQueryDto) { return this.whatsapp.listConversations(orgId, query) }

  @Get('conversations/:id')
  async getConversation(@Org() orgId: string, @Param('id') id: string) {
    return this.whatsapp.getConversation(orgId, id)
  }

  @Get('conversations/:id/messages')
  async getConversationMessages(@Org() orgId: string, @Param('id') id: string) {
    return this.whatsapp.getMessages(orgId, id)
  }

  @Get('conversations/:id/context')
  async getConversationContext(@Org() orgId: string, @Param('id') id: string) {
    return this.whatsapp.getContext(orgId, id)
  }

  @Get('conversations/:id/intelligence')
  async getConversationIntelligence(@Org() orgId: string, @Param('id') id: string) {
    return this.whatsapp.getConversationIntelligence(orgId, id)
  }

  @Post('conversations/:id/messages')
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendConversationMessage(
    @Org() orgId: string,
    @User() user: any,
    @Param('id') conversationId: string,
    @Body() body: SendConversationMessageDto,
  ) {
    const userId = user?.userId ?? user?.sub ?? null
    this.logger.log(`outbound_message conversation=${conversationId} org=${orgId} user=${userId}`)
    return this.whatsapp.sendManualMessage(orgId, userId, { ...body, conversationId })
  }

  @Post('messages/template')
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendTemplate(
    @Org() orgId: string,
    @User() user: any,
    @Body() body: SendTemplateMessageDto,
  ) {
    if (!body?.conversationId && !body?.customerId) {
      throw new BadRequestException('conversationId ou customerId é obrigatório')
    }
    const userId = user?.userId ?? user?.sub ?? null
    return this.whatsapp.sendTemplateMessage(orgId, userId, body)
  }

  @Post('messages/:id/retry')
  async retry(@Org() orgId: string, @Param('id') id: string) {
    return this.whatsapp.retryFailedMessage(orgId, id)
  }

  @Patch('conversations/:id/status')
  async updateConversationStatus(
    @Org() orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateConversationStatusDto,
  ) {
    return this.whatsapp.updateConversationStatus(orgId, id, body.status)
  }
  @Post('conversations/:id/resolve')
  async markResolved(@Org() orgId: string, @Param('id') id: string) { this.logger.log(`resolve_conversation id=${id} org=${orgId}`); return this.whatsapp.updateConversationStatus(orgId, id, WhatsAppConversationStatus.RESOLVED) }

  @Post('conversations/:id/reopen')
  async reopenConversation(@Org() orgId: string, @Param('id') id: string) { return this.whatsapp.updateConversationStatus(orgId, id, WhatsAppConversationStatus.WAITING_OPERATOR) }




  @Get('action-executions/pending')
  @ApiOperation({ summary: 'List pending WhatsApp workflow approvals' })
  async listPendingActionApprovals(@Org() orgId: string, @Query('limit') limit?: string) {
    return this.requireExecutions().listPendingApprovals(orgId, Number(limit ?? 50))
  }

  @Get('action-executions/history')
  @ApiOperation({ summary: 'List WhatsApp workflow execution history' })
  async listActionExecutionHistory(
    @Org() orgId: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requireExecutions().listHistory(orgId, conversationId, Number(limit ?? 100))
  }

  @Get('action-executions/:id')
  @ApiOperation({ summary: 'Get WhatsApp workflow execution status/result' })
  async getActionExecutionStatus(@Org() orgId: string, @Param('id') id: string) {
    return this.requireExecutions().getStatus(orgId, id)
  }

  @Post('conversations/:id/actions')
  @ApiOperation({ summary: 'Create an executable workflow from a suggested WhatsApp action' })
  async requestActionExecution(
    @Org() orgId: string,
    @User() user: any,
    @Param('id') conversationId: string,
    @Body() body: { suggestedAction?: WhatsAppSuggestedAction; executionReason?: string; actionPayload?: Record<string, unknown>; idempotencyKey?: string; autoExecuteSafe?: boolean },
  ) {
    if (!body?.suggestedAction) throw new BadRequestException('suggestedAction é obrigatório')
    return this.requireExecutions().requestExecution({
      orgId,
      conversationId,
      suggestedAction: body.suggestedAction,
      requestedBy: user?.userId ?? user?.sub ?? null,
      executionReason: body.executionReason,
      actionPayload: body.actionPayload,
      idempotencyKey: body.idempotencyKey,
      autoExecuteSafe: body.autoExecuteSafe,
    })
  }

  @Post('action-executions/:id/approve')
  @ApiOperation({ summary: 'Approve a pending WhatsApp workflow action' })
  async approveActionExecution(@Org() orgId: string, @User() user: any, @Param('id') id: string, @Body() body: { reason?: string } = {}) {
    return this.requireExecutions().approve({ orgId, executionId: id, actorUserId: user?.userId ?? user?.sub ?? null, reason: body.reason })
  }

  @Post('action-executions/:id/execute')
  @ApiOperation({ summary: 'Execute an approved WhatsApp workflow action' })
  async executeActionExecution(@Org() orgId: string, @User() user: any, @Param('id') id: string, @Body() body: { reason?: string } = {}) {
    return this.requireExecutions().execute({ orgId, executionId: id, actorUserId: user?.userId ?? user?.sub ?? null, reason: body.reason })
  }

  @Post('action-executions/:id/cancel')
  @ApiOperation({ summary: 'Cancel a WhatsApp workflow action' })
  async cancelActionExecution(@Org() orgId: string, @User() user: any, @Param('id') id: string, @Body() body: { reason?: string } = {}) {
    return this.requireExecutions().cancel({ orgId, executionId: id, actorUserId: user?.userId ?? user?.sub ?? null, reason: body.reason })
  }


  @Get('webhook-events')
  @ApiOperation({ summary: 'List inbound WhatsApp webhook events for admin/debug recovery' })
  async listWebhookEvents(@Org() orgId: string, @Query() query: ListWebhookEventsQueryDto) {
    const targetOrgId = this.resolveWebhookAdminOrgId(orgId, query.orgId)
    return this.whatsapp.listWebhookEvents(targetOrgId, query)
  }

  @Get('webhook-events/dlq/stats')
  @ApiOperation({ summary: 'WhatsApp inbound webhook DLQ/admin recovery stats' })
  async getWebhookDlqStats(@Org() orgId: string, @Query('orgId') queryOrgId?: string) {
    const targetOrgId = this.resolveWebhookAdminOrgId(orgId, queryOrgId)
    return this.whatsapp.getWebhookDlqStats(targetOrgId)
  }

  @Post('webhook-events/replay')
  @ApiOperation({ summary: 'Replay selected failed inbound WhatsApp webhook events' })
  async replayWebhookEvents(@Org() orgId: string, @User() user: any, @Body() body: ReplayWebhookEventsDto) {
    return this.whatsapp.replayWebhookEvents(orgId, {
      ids: body.ids ?? [],
      force: body.force,
      requestedBy: user?.userId ?? user?.sub ?? null,
    })
  }

  @Get('webhook-events/:id')
  @ApiOperation({ summary: 'Show inbound WhatsApp webhook event detail' })
  async getWebhookEventDetail(@Org() orgId: string, @Param('id') id: string, @Query('orgId') queryOrgId?: string) {
    const targetOrgId = this.resolveWebhookAdminOrgId(orgId, queryOrgId)
    return this.whatsapp.getWebhookEventDetail(targetOrgId, id)
  }

  @Post('webhook-events/:id/replay')
  @ApiOperation({ summary: 'Replay one failed inbound WhatsApp webhook event' })
  async replayWebhookEvent(@Org() orgId: string, @User() user: any, @Param('id') id: string, @Body() body: ReplayWebhookEventsDto = {}) {
    return this.whatsapp.replayWebhookEvents(orgId, {
      ids: [id],
      force: body.force,
      requestedBy: user?.userId ?? user?.sub ?? null,
    })
  }

  @Post('webhooks/:provider')
  @Public()
  @Roles()
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Body() payload: any, @Headers() headers: Record<string, string>) {
    const startedAt = Date.now()
    const traceId = String(headers?.['x-request-id'] ?? headers?.['x-trace-id'] ?? `wa-${Date.now()}`).trim()
    const orgId = this.extractWebhookOrgId(payload, headers)
    const serviceProvider = createWhatsAppProvider()
    if (serviceProvider.getProviderName() !== provider) throw new BadRequestException('provider inválido')
    const signatureOk = await serviceProvider.verifyWebhookSignature(payload, headers)
    if (!signatureOk) throw new BadRequestException('assinatura inválida')

    const webhookEvent = await this.whatsapp.createWebhookEvent({
      orgId,
      provider,
      eventType: String(payload?.eventType ?? payload?.type ?? 'unknown'),
      payload,
      traceId,
    })

    await this.whatsapp.enqueueInboundWebhook({
      webhookEventId: webhookEvent.id,
      orgId,
      provider,
      traceId,
      receivedAt: webhookEvent.createdAt ?? new Date(),
    })

    this.logger.log(JSON.stringify({
      action: 'whatsapp.webhook.ack',
      provider,
      orgId,
      traceId,
      webhookEventId: webhookEvent.id,
      latencyMs: Date.now() - startedAt,
    }))

    return { ok: true, provider: serviceProvider.getProviderName(), received: true, traceId, webhookEventId: webhookEvent.id }
  }

  @Post('webhook/:provider')
  @Public()
  @Roles()
  @HttpCode(200)
  async webhookLegacy(@Param('provider') provider: string, @Body() payload: any, @Headers() headers: Record<string, string>) {
    return this.webhook(provider, payload, headers)
  }

  private requireExecutions() {
    if (!this.executions) throw new BadRequestException('Serviço de execução WhatsApp indisponível')
    return this.executions
  }

  private extractWebhookOrgId(payload: any, headers: Record<string, string>) {
    const raw = headers?.['x-org-id'] ?? headers?.['x-nexo-org-id'] ?? payload?.orgId ?? payload?.tenantId
    const orgId = String(raw ?? '').trim()
    if (!orgId) throw new BadRequestException('orgId é obrigatório para webhook WhatsApp')
    return orgId
  }

  private resolveWebhookAdminOrgId(authOrgId: string, queryOrgId?: string) {
    const requested = String(queryOrgId ?? '').trim()
    if (requested && requested !== authOrgId) throw new BadRequestException('orgId não pertence ao tenant autenticado')
    if (!authOrgId?.trim()) throw new BadRequestException('orgId é obrigatório')
    return authOrgId
  }

  @Get('health')
  async health() {
    const readiness = getWhatsAppProviderReadiness(process.env)
    const provider = createWhatsAppProvider()
    return {
      provider: provider.getProviderName(),
      status: readiness.mode === 'mock' ? 'configured_mock' : readiness.isReady ? 'configured' : 'misconfigured',
      missingEnv: readiness.missingEnv,
      queueAvailable: this.whatsapp.isQueueAvailable(),
      evaluatedAt: new Date().toISOString(),
    }
  }

  // Backward compatibility
  @Get('messages/:customerId')
  async getMessagesByCustomer(
    @Org() orgId: string,
    @Param('customerId') customerId: string,
    @Query() query: MessageFeedQueryDto,
  ) {
    return this.whatsapp.getMessagesFeed({
      orgId,
      customerId,
      cursor: query.cursor ? String(query.cursor) : undefined,
      limit: query.limit,
    })
  }

  @Post('messages')
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendMessage(
    @Org() orgId: string,
    @User() user: any,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body() body: SendMessageDto,
  ) {
    await this.quotas.validateQuota(orgId, 'SEND_MESSAGE')

    const payload = {
      customerId: body.customerId,
      toPhone: body.toPhone,
      entityType: body.entityType ?? 'CUSTOMER',
      entityId: body.entityId ?? body.customerId,
      messageType: body.messageType ?? 'MANUAL',
      content: body.content,
    }

    const idempotencyKey =
      String(body?.idempotencyKey ?? idempotencyKeyHeader ?? '').trim()
      || buildDeterministicMessageKey({
        entityType: payload.entityType,
        entityId: String(payload.entityId),
        messageType: payload.messageType,
      })

    const idem = await this.idempotency.begin({
      orgId,
      scope: 'whatsapp.send_message',
      idempotencyKey,
      payload,
    })

    if (idem.mode === 'replay') {
      return idem.response
    }

    try {
      const userId = user?.userId ?? user?.sub ?? null
      const result = await this.whatsapp.sendManualMessage(orgId, userId, payload)
      await this.idempotency.complete(idem.recordId, result)
      return result
    } catch (error: any) {
      await this.idempotency.fail(idem.recordId, error?.code)
      throw error
    }
  }

  @Patch('messages/:id/status')
  async updateStatus(
    @Org() orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateMessageStatusDto,
  ) {
    return this.whatsapp.updateMessageStatus(orgId, { id, status: body.status })
  }
}
