import { Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { UpdateAuditSettingsDto } from './dto/audit-settings.dto';

@ApiTags('System Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (super admin only), filterable + paginated' })
  list(@Query() query: ListAuditLogsDto) {
    return this.auditService.findMany({
      action: query.action,
      subject: query.subject,
      search: query.search,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get whether audit logging is currently enabled' })
  getSettings() {
    return this.auditService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Enable or disable audit logging platform-wide' })
  updateSettings(@Body() dto: UpdateAuditSettingsDto, @Req() req: any) {
    return this.auditService.updateSettings(dto.enabled, req.user?.id);
  }
}
