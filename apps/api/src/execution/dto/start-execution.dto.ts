import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator'

export class StartExecutionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  serviceOrderId!: string

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional({
    type: 'array',
    items: {},
    description: 'Checklist JSON historicamente associado à execução.',
  })
  @IsOptional()
  @IsArray()
  checklist?: unknown[]

  @ApiPropertyOptional({
    type: 'array',
    items: {},
    description: 'Anexos JSON historicamente associados à execução.',
  })
  @IsOptional()
  @IsArray()
  attachments?: unknown[]
}

export class ExecutionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  orgId!: string

  @ApiProperty({ format: 'uuid' })
  serviceOrderId!: string

  @ApiProperty({ format: 'uuid' })
  customerId!: string

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  executorPersonId!: string | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  startedAt!: Date | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  endedAt!: Date | null

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null

  @ApiProperty({ type: 'array', items: {} })
  checklist!: unknown[]

  @ApiProperty({ type: 'array', items: {} })
  attachments!: unknown[]

  @ApiProperty()
  status!: string

  @ApiPropertyOptional({ nullable: true, type: Number })
  amountCents!: number | null

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  dueDate!: Date | null

  @ApiProperty({ example: 'service-order-fallback' })
  mode!: string

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date

  @ApiPropertyOptional()
  idempotent?: boolean
}
