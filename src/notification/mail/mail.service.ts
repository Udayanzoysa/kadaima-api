import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationConfigService } from '../../settings/notification-config.service';
import { smtpSecureFlag } from '../../settings/notification-config.types';
import {
  INotificationService,
  SendNotificationPayload,
} from '../interfaces/notification.interface';
import {
  buildPasswordResetEmail,
  buildSmtpTestEmail,
  PasswordResetEmailContent,
} from './email-templates';

export interface SentMailResult {
  delivered: boolean;
  mode: 'smtp' | 'dev-log';
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId?: string;
}

@Injectable()
export class MailService implements INotificationService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly notificationConfig: NotificationConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getFrontendUrl() {
    return this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  private getSupportEmail() {
    return this.config.get<string>('SUPPORT_EMAIL') || 'support@kadaima.com';
  }

  private getExpiresMinutes() {
    const ttlSeconds = this.config.get<number>('RESET_TOKEN_TTL') ?? 600;
    return Math.max(1, Math.round(ttlSeconds / 60));
  }

  previewPasswordResetTemplate(
    recipientEmail: string,
    code = '123456',
    userName?: string,
  ): PasswordResetEmailContent {
    return buildPasswordResetEmail({
      recipientEmail,
      userName,
      code,
      frontendUrl: this.getFrontendUrl(),
      expiresMinutes: this.getExpiresMinutes(),
      supportEmail: this.getSupportEmail(),
    });
  }

  getEmailTemplatePreview(sampleEmail = 'student@example.com', userName?: string) {
    const content = this.previewPasswordResetTemplate(sampleEmail, '123456', userName);
    return {
      to: sampleEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
      resetUrl:
        `${this.getFrontendUrl().replace(/\/$/, '')}/reset-password` +
        `?channel=EMAIL&email=${encodeURIComponent(sampleEmail)}&code=123456`,
    };
  }

  /**
   * Sends the password-reset template via SMTP.
   * Requires a registered active user email.
   */
  async testSmtpEmail(to: string) {
    const normalized = to.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
      },
      select: { id: true, email: true, status: true, name: true },
    });

    if (!user || user.status === 'Inactive') {
      throw new BadRequestException('No user found for that email.');
    }

    const result = await this.sendTestEmail(user.email, user.name || undefined);

    return {
      userFound: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      delivered: result.delivered,
      mode: result.mode,
      from: result.from,
      to: result.to,
      subject: result.subject,
      messageId: result.messageId,
      html: result.html,
      text: result.text,
      message: result.delivered
        ? `Test email sent to ${result.to}. Check the inbox (and spam).`
        : `SMTP is not fully configured — email was logged on the server instead of sent. Preview is included below.`,
    };
  }

  private async buildTransporter(): Promise<{
    transporter: Transporter | null;
    from: string;
    configured: boolean;
  }> {
    const smtp = await this.notificationConfig.getRuntimeSmtp();
    if (!smtp.host) {
      return { transporter: null, from: 'noreply@techwing.local', configured: false };
    }

    const secure = smtpSecureFlag(smtp.encryption, smtp.port);
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure,
      auth:
        smtp.user || smtp.pass
          ? {
              user: smtp.user || undefined,
              pass: smtp.pass || undefined,
            }
          : undefined,
    });

    const from = smtp.from || smtp.user || 'noreply@techwing.local';
    const configured = Boolean(smtp.host && smtp.user && smtp.pass);
    return { transporter, from, configured };
  }

  async send(payload: SendNotificationPayload): Promise<void> {
    if (payload.channel !== 'EMAIL') return;

    const content = buildPasswordResetEmail({
      recipientEmail: payload.destination,
      userName: payload.userName,
      code: payload.code || '------',
      frontendUrl: this.getFrontendUrl(),
      expiresMinutes: this.getExpiresMinutes(),
      supportEmail: this.getSupportEmail(),
    });

    await this.deliver({
      to: payload.destination,
      subject: payload.subject || content.subject,
      text: content.text,
      html: content.html,
    });
  }

  async sendTestEmail(to: string, userName?: string): Promise<SentMailResult> {
    const content = buildSmtpTestEmail({
      recipientEmail: to,
      userName,
      frontendUrl: this.getFrontendUrl(),
      supportEmail: this.getSupportEmail(),
    });
    return this.deliver({
      to,
      subject: `[SMTP TEST] ${content.subject}`,
      text: content.text,
      html: content.html,
    });
  }

  private async deliver(mail: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<SentMailResult> {
    const { transporter, from, configured } = await this.buildTransporter();

    if (!transporter || !configured) {
      this.logger.log(
        `[dev-mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`,
      );
      return {
        delivered: false,
        mode: 'dev-log',
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      return {
        delivered: true,
        mode: 'smtp',
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        messageId: info.messageId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMTP send failed: ${message}`);
      throw new BadRequestException(
        `SMTP send failed: ${message}. Check host, port, encryption, username and password.`,
      );
    }
  }
}
