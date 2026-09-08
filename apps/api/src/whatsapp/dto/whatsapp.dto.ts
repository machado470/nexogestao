import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator'
import { WhatsAppConversationStatus, WhatsAppEntityType, WhatsAppMessageStatus, WhatsAppMessageType, WhatsAppWebhookStatus } from '@prisma/client'

export class ListConversationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class SendConversationMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string

  @ApiPropertyOptional({ enum: WhatsAppMessageType })
  @IsOptional()
  @IsEnum(WhatsAppMessageType)
  messageType?: WhatsAppMessageType
}

export enum WhatsAppTemplateKey {
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_LINK = 'payment_link',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  SERVICE_UPDATE = 'service_update',
  MANUAL_FOLLOWUP = 'manual_followup',
}

export class WhatsAppTemplateContextDto {
  [key: string]: unknown

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() customerName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() appointmentDate?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() appointmentTime?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() chargeAmount?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() chargeDueDate?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() paymentLink?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() serviceOrderNumber?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() companyName?: string
}

export class SendTemplateMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversationId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiProperty({ enum: WhatsAppTemplateKey })
  @IsEnum(WhatsAppTemplateKey)
  templateKey!: WhatsAppTemplateKey

  @ApiPropertyOptional({ type: WhatsAppTemplateContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsAppTemplateContextDto)
  context?: WhatsAppTemplateContextDto
}

export class UpdateConversationStatusDto {
  @ApiProperty({ enum: WhatsAppConversationStatus })
  @IsEnum(WhatsAppConversationStatus)
  status!: WhatsAppConversationStatus
}

export class SendMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toPhone?: string

  @ApiPropertyOptional({ enum: WhatsAppEntityType })
  @IsOptional()
  @IsEnum(WhatsAppEntityType)
  entityType?: WhatsAppEntityType

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string

  @ApiPropertyOptional({ enum: WhatsAppMessageType })
  @IsOptional()
  @IsEnum(WhatsAppMessageType)
  messageType?: WhatsAppMessageType

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string
}

export class ListWebhookEventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string

  @ApiPropertyOptional({ enum: WhatsAppWebhookStatus })
  @IsOptional()
  @IsEnum(WhatsAppWebhookStatus)
  status?: WhatsAppWebhookStatus

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  traceId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerMessageId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdAtFrom?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  createdAtTo?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string
}

export class ReplayWebhookEventsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[]

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean
}

export class UpdateMessageStatusDto {
  @ApiProperty({ enum: WhatsAppMessageStatus })
  @IsEnum(WhatsAppMessageStatus)
  status!: WhatsAppMessageStatus
}

export class MessageFeedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
