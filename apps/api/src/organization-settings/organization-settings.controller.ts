import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { OrganizationSettingsService } from './organization-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

@Controller('organization-settings')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles('ADMIN')
export class OrganizationSettingsController {
  constructor(private readonly organizationSettingsService: OrganizationSettingsService) {}

  @Get()
  async getSettings(@Request() req) {
    const orgId = req.user.orgId;
    return this.organizationSettingsService.getOrganizationSettings(orgId);
  }

  @Get('administrative-summary')
  async getAdministrativeSummary(@Request() req) {
    return this.organizationSettingsService.getAdministrativeSummary(req.user.orgId);
  }

  @Patch()
  async updateSettings(@Request() req, @Body() updateOrganizationSettingsDto: UpdateOrganizationSettingsDto) {
    const orgId = req.user.orgId;
    return this.organizationSettingsService.updateOrganizationSettings(orgId, updateOrganizationSettingsDto);
  }
}
