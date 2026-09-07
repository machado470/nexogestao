import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString } from 'class-validator'

export class CompleteExecutionDto {
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
