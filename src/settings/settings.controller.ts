import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MailService } from '../notification/mail/mail.service';
import {
  TestEmailDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';
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

  @Get('notifications')
  @ApiOperation({ summary: 'Get SMTP + SMS gateway configuration' })
  getNotificationSettings() {
    return this.settingsService.getNotificationSettings();
  }

  @Put('notifications')
  @ApiOperation({ summary: 'Update SMTP and/or SMS gateway configuration' })
  updateNotificationSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @Req() req: any,
  ) {
    return this.settingsService.updateNotificationSettings(dto, req.user?.id);
  }

  @Get('notifications/email-template')
  @ApiOperation({ summary: 'Preview the password-reset email HTML template' })
  @ApiQuery({ name: 'email', required: false })
  getEmailTemplate(@Query('email') email?: string) {
    return this.mailService.getEmailTemplatePreview(
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
}
