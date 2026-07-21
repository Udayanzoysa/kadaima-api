import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit/audit-log.decorator';
import { RevenueService } from './revenue.service';
import {
  CalculateRevenuePeriodDto,
  UpdatePayoutStatusDto,
} from './dto/revenue.dto';

@ApiTags('Revenue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('periods')
  @ApiOperation({ summary: 'List revenue settlement periods' })
  listPeriods() {
    return this.revenueService.listPeriods();
  }

  @Get('periods/:id')
  @ApiOperation({ summary: 'Get period detail with teacher shares and payouts' })
  getPeriod(@Param('id', ParseUUIDPipe) id: string) {
    return this.revenueService.getPeriod(id);
  }

  @Post('periods/calculate')
  @Audit('REVENUE', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Calculate (or recalculate) a calendar month: subscription R × pool split by completed attempts',
  })
  calculate(@Body() dto: CalculateRevenuePeriodDto) {
    return this.revenueService.calculatePeriod(dto);
  }

  @Post('periods/:id/settle')
  @Audit('REVENUE', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Create Pending payout rows from calculated shares' })
  settle(@Param('id', ParseUUIDPipe) id: string) {
    return this.revenueService.settlePeriod(id);
  }

  @Post('periods/:id/mark-paid')
  @Audit('REVENUE', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Mark period and open payouts as Paid' })
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.revenueService.markPeriodPaid(id);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List teacher payouts (optionally filter by period)' })
  @ApiQuery({ name: 'periodId', required: false })
  listPayouts(@Query('periodId') periodId?: string) {
    return this.revenueService.listPayouts(periodId);
  }

  @Patch('payouts/:id')
  @Audit('REVENUE', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update a single payout status / reference' })
  updatePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutStatusDto,
  ) {
    return this.revenueService.updatePayout(id, dto);
  }
}
