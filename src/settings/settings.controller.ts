import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
import { MailService } from '../notification/mail/mail.service';
import { UpdateBillingSettingsDto } from './dto/billing-settings.dto';
import {
  TestEmailDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';
import { UpdateAiSettingsDto } from './dto/ai-settings.dto';
import { UpdateSeoSettingsDto } from './dto/seo-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Platform Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mailService: MailService,
  ) {}

  @Get('billing')
  @ApiOperation({ summary: 'Get monthly student subscription fee' })
  getBillingSettings() {
    return this.settingsService.getBillingSettings();
  }

  @Put('billing')
  @Audit('SETTINGS', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update monthly student subscription fee' })
  updateBillingSettings(@Body() dto: UpdateBillingSettingsDto, @Req() req: any) {
    return this.settingsService.updateBillingSettings(dto, req.user?.id);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get SMTP + SMS gateway configuration' })
  getNotificationSettings() {
    return this.settingsService.getNotificationSettings();
  }

  @Put('notifications')
  @Audit('SETTINGS', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update SMTP and/or SMS gateway configuration' })
  updateNotificationSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @Req() req: any,
  ) {
    return this.settingsService.updateNotificationSettings(dto, req.user?.id);
  }

  @Get('notifications/email-template')
  @ApiOperation({
    summary:
      'Preview a transactional email HTML template (password-reset, welcome, payment, etc.)',
  })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({
    name: 'kind',
    required: false,
    description:
      'password-reset | password-changed | welcome | invite | teacher-activated | payment-receipt | payment-failed | slip-reviewed | teacher-payout-pending | teacher-payout-approved | teacher-payout-paid | teacher-payout-held',
  })
  getEmailTemplate(
    @Query('email') email?: string,
    @Query('kind') kind?: string,
  ) {
    const allowed = this.mailService.listTemplateKinds();
    const resolvedKind = allowed.includes(kind as any)
      ? (kind as (typeof allowed)[number])
      : 'password-reset';
    return this.mailService.getEmailTemplatePreview(
      resolvedKind,
      email?.trim() || 'student@example.com',
    );
  }

  @Post('notifications/test-email')
  @ApiOperation({
    summary:
      'Send a test password-reset email via SMTP. Fails if the email is not a registered user.',
  })
  testEmail(@Body() dto: TestEmailDto) {
    return this.mailService.testSmtpEmail(dto.to);
  }

  @Get('ai')
  @ApiOperation({ summary: 'Get Gemini AI settings for Kadaima Expert chat' })
  getAiSettings() {
    return this.settingsService.getAiSettings();
  }

  @Put('ai')
  @Audit('SETTINGS', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update Gemini AI settings for Kadaima Expert + WhatsApp bot' })
  updateAiSettings(@Body() dto: UpdateAiSettingsDto, @Req() req: any) {
    return this.settingsService.updateAiSettings(dto, req.user?.id);
  }

  @Get('seo')
  @ApiOperation({ summary: 'Get site branding / SEO / Google Analytics settings' })
  getSeoSettings() {
    return this.settingsService.getSeoSettings();
  }

  @Put('seo')
  @Audit('SETTINGS', AuditAction.UPDATE)
  @ApiOperation({ summary: 'Update site branding / SEO / Google Analytics settings' })
  updateSeoSettings(@Body() dto: UpdateSeoSettingsDto, @Req() req: any) {
    return this.settingsService.updateSeoSettings(dto, req.user?.id);
  }
}
