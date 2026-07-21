import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RevenueService } from './revenue.service';
import { UpsertTeacherPayoutProfileDto } from './dto/revenue.dto';

@ApiTags('Teacher Earnings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teacher')
export class TeacherEarningsController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('earnings')
  @ApiOperation({
    summary: 'Teacher earnings summary, monthly shares, and payout history',
  })
  getEarnings(@Req() req: { user: { id: string } }) {
    return this.revenueService.getTeacherEarnings(req.user.id);
  }

  @Get('payout-profile')
  @ApiOperation({ summary: 'Get teacher bank payout profile' })
  getPayoutProfile(@Req() req: { user: { id: string } }) {
    return this.revenueService.getPayoutProfile(req.user.id);
  }

  @Put('payout-profile')
  @ApiOperation({ summary: 'Upsert teacher bank payout profile' })
  upsertPayoutProfile(
    @Req() req: { user: { id: string } },
    @Body() dto: UpsertTeacherPayoutProfileDto,
  ) {
    return this.revenueService.upsertPayoutProfile(req.user.id, dto);
  }
}
