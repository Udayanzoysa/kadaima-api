export interface PasswordResetEmailContent {
  subject: string;
  text: string;
  html: string;
}

export function buildPasswordResetEmail(options: {
  recipientEmail: string;
  userName?: string;
  code: string;
  frontendUrl: string;
  expiresMinutes?: number;
  supportEmail?: string;
}): PasswordResetEmailContent {
  const expiresMinutes = options.expiresMinutes ?? 10;
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName =
    options.userName?.trim() || options.recipientEmail.split('@')[0] || 'there';

  const base = options.frontendUrl.replace(/\/$/, '');
  const resetUrl =
    `${base}/reset-password` +
    `?channel=EMAIL` +
    `&email=${encodeURIComponent(options.recipientEmail)}` +
    `&code=${encodeURIComponent(options.code)}`;

  const subject = 'Reset your Kadaima Educational password';

  const text = [
    `Hi ${displayName},`,
    '',
    'We received a request to reset the password for your Kadaima Educational account.',
    '',
    `Click the link below to set a new password. This link will expire in ${expiresMinutes} minutes for your security.`,
    '',
    resetUrl,
    '',
    'If you did not request this password reset, please ignore this email. Your password will remain unchanged.',
    '',
    `If you need further assistance, please contact our support team at ${supportEmail}.`,
    '',
    'The Kadaima Educational Team',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;padding:40px 16px;">
    <tr>
      <td align="center">
        <div style="font-size:22px;font-weight:700;color:#1d4ed8;margin-bottom:20px;letter-spacing:0.01em;">
          Kadaima <span style="font-weight:500;color:#64748b;font-size:16px;">(කඩඉම)</span>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(37,99,235,0.08);border:1px solid #dbeafe;">
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;">Reset your password</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Hi ${escapeHtml(displayName)},</p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#475569;">
                We received a request to reset the password for your Kadaima Educational account.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#475569;">
                Click the button below to set a new password. This link will expire in
                <strong>${expiresMinutes} minutes</strong> for your security.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:10px;">
                    <a href="${escapeHtml(resetUrl)}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">
                <a href="${escapeHtml(resetUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(resetUrl)}</a>
              </p>

              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;font-size:13px;line-height:1.55;color:#1e40af;">
                  If you did not request this password reset, please ignore this email. Your password will remain unchanged.
                  If you need further assistance, contact
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1d4ed8;font-weight:600;">${escapeHtml(supportEmail)}</a>.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">The Kadaima Educational Team</p>
              <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">
                © ${new Date().getFullYear()} Kadaima Educational Platform. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildSmtpTestEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
}): PasswordResetEmailContent {
  return buildPasswordResetEmail({
    recipientEmail: options.recipientEmail,
    userName: options.userName,
    code: '123456',
    frontendUrl: options.frontendUrl,
    expiresMinutes: 10,
    supportEmail: options.supportEmail,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
