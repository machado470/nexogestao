import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Res,
  Headers,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { Org } from '../auth/decorators/org.decorator'
import { User } from '../auth/decorators/user.decorator'

import { CustomersService } from './customers.service'
import { CustomersOperationalSummaryService } from './customers-operational-summary.service'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { UpdateCustomerDto } from './dto/update-customer.dto'
import { ListCustomersQueryDto } from './dto/list-customers-query.dto'
import { QuotasService } from '../quotas/quotas.service'

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly quotas: QuotasService,
    private readonly operationalSummary: CustomersOperationalSummaryService,
  ) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  list(@Org() orgId: string, @Query() query: ListCustomersQueryDto) {
    return this.customers.list(orgId, query)
  }

  @Get('export')
  @Roles('ADMIN', 'MANAGER')
  async export(@Org() orgId: string, @Res() res) {
    const csv = await this.customers.exportCsv(orgId)
    res.set('Content-Type', 'text/csv')
    res.attachment(`customers-${orgId}-${Date.now()}.csv`)
    return res.send(csv)
  }

  @Get('operational-summary')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  operationalSummaryForPortfolio(@Org() orgId: string) {
    return this.operationalSummary.getSummary(orgId)
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  get(@Org() orgId: string, @Param('id') id: string) {
    return this.customers.get(orgId, id)
  }

  @Get(':id/workspace')
  @Roles('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')
  workspace(@Org() orgId: string, @Param('id') id: string) {
    return this.customers.workspace(orgId, id)
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  async create(
    @Org() orgId: string,
    @User() user: any,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body() body: CreateCustomerDto,
  ) {
    // Validar quota antes de criar
    await this.quotas.validateQuota(orgId, 'CREATE_CUSTOMER')

    const actorUserId = user?.userId ?? null
    const actorPersonId = user?.personId ?? null

    return this.customers.create({
      orgId,
      createdBy: actorUserId,
      personId: actorPersonId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
      cpfCnpj: body.cpfCnpj,
      address: body.address,
      idempotencyKey: body.idempotencyKey ?? idempotencyKeyHeader,
    })
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  update(
    @Org() orgId: string,
    @User() user: any,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    const actorUserId = user?.userId ?? null
    const actorPersonId = user?.personId ?? null

    return this.customers.update({
      orgId,
      updatedBy: actorUserId,
      personId: actorPersonId,
      id,
      data: body,
    })
  }
}
