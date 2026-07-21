export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** @deprecated Use EmailContent */
export type PasswordResetEmailContent = EmailContent;
/** @deprecated Use EmailContent */
export type WelcomeEmailContent = EmailContent;

export type WelcomeAccountType = 'student' | 'teacher' | 'admin' | 'member';

export type EmailTemplateKind =
  | 'password-reset'
  | 'password-changed'
  | 'welcome'
  | 'invite'
  | 'teacher-activated'
  | 'payment-receipt'
  | 'payment-failed'
  | 'slip-reviewed'
  | 'teacher-payout-pending'
  | 'teacher-payout-approved'
  | 'teacher-payout-paid'
  | 'teacher-payout-held';

export type TeacherPayoutEmailStatus = 'Pending' | 'Approved' | 'Paid' | 'Held';

export const EMAIL_TEMPLATE_KINDS: EmailTemplateKind[] = [
  'password-reset',
  'password-changed',
  'welcome',
  'invite',
  'teacher-activated',
  'payment-receipt',
  'payment-failed',
  'slip-reviewed',
  'teacher-payout-pending',
  'teacher-payout-approved',
  'teacher-payout-paid',
  'teacher-payout-held',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brandLogoHeader(frontendUrl: string): string {
  const base = frontendUrl.replace(/\/$/, '');
  const logoUrl = `${base}/brand/kadaima-logo.png`;
  return `<div style="margin-bottom:20px;">
          <img src="${escapeHtml(logoUrl)}" alt="Kadaima" width="180" height="54" style="display:block;margin:0 auto;height:54px;width:auto;max-width:220px;" />
        </div>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius:10px;">
                    <a href="${escapeHtml(url)}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      ${escapeHtml(label)}
                    </a>
                  </td>
                </tr>
              </table>`;
}

/** Shared branded shell for all transactional emails. */
export function renderEmailLayout(options: {
  subject: string;
  title: string;
  displayName: string;
  bodyHtml: string;
  frontendUrl: string;
  supportEmail: string;
  preheader?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerNoteHtml?: string;
}): string {
  const base = options.frontendUrl.replace(/\/$/, '');
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const cta =
    options.ctaUrl && options.ctaLabel
      ? ctaButton(options.ctaUrl, options.ctaLabel)
      : '';
  const footerNote =
    options.footerNoteHtml ||
    `Need help? Contact
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1d4ed8;font-weight:600;">${escapeHtml(supportEmail)}</a>.`;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;padding:40px 16px;">
    <tr>
      <td align="center">
        ${brandLogoHeader(base)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(37,99,235,0.08);border:1px solid #dbeafe;">
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;">${escapeHtml(options.title)}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Hi ${escapeHtml(options.displayName)},</p>
              ${options.bodyHtml}
              ${cta}
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;font-size:13px;line-height:1.55;color:#1e40af;">${footerNote}</p>
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
}

function displayNameFrom(options: {
  userName?: string;
  recipientEmail: string;
}): string {
  return (
    options.userName?.trim() ||
    options.recipientEmail.split('@')[0] ||
    'there'
  );
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#475569;">${text}</p>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
      <td style="padding:6px 0;font-size:13px;color:#64748b;width:40%;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(value)}</td>
    </tr>`;
}

function detailsTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
    ${rows}
  </table>`;
}

export function buildPasswordResetEmail(options: {
  recipientEmail: string;
  userName?: string;
  code: string;
  frontendUrl: string;
  expiresMinutes?: number;
  supportEmail?: string;
}): EmailContent {
  const expiresMinutes = options.expiresMinutes ?? 10;
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
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
    `Click the link below to set a new password. This link will expire in ${expiresMinutes} minutes.`,
    '',
    resetUrl,
    '',
    'If you did not request this, please ignore this email. Your password will remain unchanged.',
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ].join('\n');

  const html = renderEmailLayout({
    subject,
    title: 'Reset your password',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: `Password reset link — expires in ${expiresMinutes} minutes`,
    bodyHtml: `
              ${p('We received a request to reset the password for your Kadaima Educational account.')}
              ${p(`Click the button below to set a new password. This link will expire in <strong>${expiresMinutes} minutes</strong>.`)}
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                Or copy this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;text-align:center;">
                <a href="${escapeHtml(resetUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(resetUrl)}</a>
              </p>`,
    ctaUrl: resetUrl,
    ctaLabel: 'Reset My Password',
    footerNoteHtml: `If you did not request this password reset, ignore this email. Your password will remain unchanged.
                  Contact
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1d4ed8;font-weight:600;">${escapeHtml(supportEmail)}</a>
                  if you need help.`,
  });

  return { subject, text, html };
}

export function buildPasswordChangedEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  reason: 'changed' | 'reset';
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login`;
  const isReset = options.reason === 'reset';

  const subject = isReset
    ? 'Your Kadaima password was reset'
    : 'Your Kadaima password was changed';
  const title = isReset ? 'Password reset successful' : 'Password changed';
  const lead = isReset
    ? 'Your password was successfully reset using a secure link. You can now sign in with your new password.'
    : 'Your account password was just changed. If this was you, no further action is needed.';

  const text = [
    `Hi ${displayName},`,
    '',
    lead,
    '',
    `Sign in: ${loginUrl}`,
    '',
    `If you did not make this change, contact ${supportEmail} immediately.`,
    '',
    'The Kadaima Educational Team',
  ].join('\n');

  const html = renderEmailLayout({
    subject,
    title,
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: subject,
    bodyHtml: `
              ${p(escapeHtml(lead))}
              ${p(`Account: <strong>${escapeHtml(options.recipientEmail)}</strong>`)}`,
    ctaUrl: loginUrl,
    ctaLabel: 'Sign in to Kadaima',
    footerNoteHtml: `If you did not make this change, contact
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1d4ed8;font-weight:600;">${escapeHtml(supportEmail)}</a>
                  immediately.`,
  });

  return { subject, text, html };
}

export function buildSmtpTestEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
}): EmailContent {
  return buildPasswordResetEmail({
    recipientEmail: options.recipientEmail,
    userName: options.userName,
    code: '123456',
    frontendUrl: options.frontendUrl,
    expiresMinutes: 10,
    supportEmail: options.supportEmail,
  });
}

export function buildWelcomeEmail(options: {
  recipientEmail: string;
  userName?: string;
  accountType?: WelcomeAccountType;
  frontendUrl: string;
  supportEmail?: string;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const accountType = options.accountType || 'member';
  const base = options.frontendUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login`;

  if (accountType === 'teacher') {
    const subject = 'Thank you for registering as a teacher — Kadaima';
    const text = [
      `Hi ${displayName},`,
      '',
      'Thank you for registering with Kadaima Educational as a teacher.',
      '',
      'Our team will review your profile shortly. Once approved we will activate your teacher profile so you can publish your page and start teaching.',
      '',
      `Sign in: ${loginUrl}`,
      '',
      `Questions? Contact ${supportEmail}.`,
      '',
      'The Kadaima Educational Team',
    ].join('\n');

    const html = renderEmailLayout({
      subject,
      title: 'Thank you for registering',
      displayName,
      frontendUrl: base,
      supportEmail,
      preheader: 'Your teacher registration is under review',
      bodyHtml: `
              ${p('Thank you for registering with <strong>Kadaima Educational</strong> as a teacher.')}
              ${p('Our team will review your profile shortly. A representative will contact you, and once approved we will <strong>activate your teacher profile</strong> so you can publish your page and start teaching.')}
              ${p(`Account email: <strong>${escapeHtml(options.recipientEmail)}</strong>`)}`,
      ctaUrl: loginUrl,
      ctaLabel: 'Sign in to Kadaima',
    });

    return { subject, text, html };
  }

  const roleLabel =
    accountType === 'student'
      ? 'student'
      : accountType === 'admin'
        ? 'workspace admin'
        : 'member';

  const subject = 'Welcome to Kadaima Educational';
  const text = [
    `Hi ${displayName},`,
    '',
    `Welcome to Kadaima Educational! Your ${roleLabel} account is ready.`,
    '',
    `Sign in: ${loginUrl}`,
    '',
    `If you need help getting started, contact ${supportEmail}.`,
    '',
    'The Kadaima Educational Team',
  ].join('\n');

  const html = renderEmailLayout({
    subject,
    title: 'Welcome aboard',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: 'Your Kadaima account is ready',
    bodyHtml: `
              ${p(`Your <strong>${escapeHtml(roleLabel)}</strong> account on Kadaima Educational is ready. We’re glad you’re here — sign in to start learning.`)}
              ${p(`Account email: <strong>${escapeHtml(options.recipientEmail)}</strong>`)}`,
    ctaUrl: loginUrl,
    ctaLabel: 'Sign in to Kadaima',
  });

  return { subject, text, html };
}

export function buildInviteEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  invitedByName?: string;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login`;
  const by = options.invitedByName?.trim();

  const subject = 'You’re invited to Kadaima Educational';
  const text = [
    `Hi ${displayName},`,
    '',
    by
      ? `${by} invited you to continue using your Kadaima Educational account.`
      : 'You have been invited to continue using your Kadaima Educational account.',
    '',
    `Sign in: ${loginUrl}`,
    '',
    `If you forgot your password, use “Forgot password” on the login page.`,
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ].join('\n');

  const html = renderEmailLayout({
    subject,
    title: 'You’re invited',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: 'Invitation to Kadaima Educational',
    bodyHtml: `
              ${p(
                by
                  ? `<strong>${escapeHtml(by)}</strong> invited you to continue using your Kadaima Educational account.`
                  : 'You have been invited to continue using your Kadaima Educational account.',
              )}
              ${p(`Account email: <strong>${escapeHtml(options.recipientEmail)}</strong>`)}
              ${p('If you forgot your password, use <strong>Forgot password</strong> on the login page.')}`,
    ctaUrl: loginUrl,
    ctaLabel: 'Sign in to Kadaima',
  });

  return { subject, text, html };
}

export function buildTeacherActivatedEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  publicPagePath?: string | null;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login`;
  const pageUrl = options.publicPagePath
    ? `${base}${options.publicPagePath.startsWith('/') ? '' : '/'}${options.publicPagePath}`
    : loginUrl;

  const subject = 'Your teacher profile is now active — Kadaima';
  const text = [
    `Hi ${displayName},`,
    '',
    'Great news! Your teacher profile on Kadaima Educational has been reviewed and activated.',
    '',
    'You can now customize and publish your teacher page, and start sharing quizzes with students.',
    '',
    `Sign in: ${loginUrl}`,
    options.publicPagePath ? `Your page: ${pageUrl}` : '',
    '',
    `Questions? Contact ${supportEmail}.`,
    '',
    'The Kadaima Educational Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailLayout({
    subject,
    title: 'Your profile is active',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: 'Your teacher profile is active',
    bodyHtml: `
              ${p('Great news! Your teacher profile on <strong>Kadaima Educational</strong> has been reviewed and <strong>activated</strong>.')}
              ${p('You can now customize and publish your teacher page, and start sharing quizzes with students.')}`,
    ctaUrl: loginUrl,
    ctaLabel: 'Go to your dashboard',
  });

  return { subject, text, html };
}

export function buildPaymentReceiptEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  purpose: 'SUBSCRIPTION' | 'QUIZ' | string;
  amountLkr: number;
  orderId: string;
  quizTitle?: string | null;
  currency?: string;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const paymentsUrl = `${base}/payments`;
  const currency = options.currency || 'LKR';
  const amount = `${currency} ${Number(options.amountLkr).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
  const purposeLabel =
    options.purpose === 'SUBSCRIPTION'
      ? 'Monthly subscription'
      : options.purpose === 'QUIZ'
        ? 'Quiz unlock'
        : options.purpose;

  const subject = `Payment receipt — ${amount}`;
  const text = [
    `Hi ${displayName},`,
    '',
    'Thank you — your payment was successful.',
    '',
    `Purpose: ${purposeLabel}`,
    options.quizTitle ? `Quiz: ${options.quizTitle}` : '',
    `Amount: ${amount}`,
    `Order ID: ${options.orderId}`,
    '',
    `View payments: ${paymentsUrl}`,
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailLayout({
    subject,
    title: 'Payment successful',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: `Receipt for ${amount}`,
    bodyHtml: `
              ${p('Thank you — your payment on <strong>Kadaima Educational</strong> was successful.')}
              ${detailsTable(
                detailRow('Purpose', purposeLabel) +
                  (options.quizTitle
                    ? detailRow('Quiz', options.quizTitle)
                    : '') +
                  detailRow('Amount', amount) +
                  detailRow('Order ID', options.orderId),
              )}`,
    ctaUrl: paymentsUrl,
    ctaLabel: 'View my payments',
  });

  return { subject, text, html };
}

export function buildPaymentFailedEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  purpose: 'SUBSCRIPTION' | 'QUIZ' | string;
  amountLkr: number;
  orderId: string;
  status: string;
  quizTitle?: string | null;
  currency?: string;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const quizUrl = `${base}/quiz`;
  const currency = options.currency || 'LKR';
  const amount = `${currency} ${Number(options.amountLkr).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
  const purposeLabel =
    options.purpose === 'SUBSCRIPTION'
      ? 'Monthly subscription'
      : options.purpose === 'QUIZ'
        ? 'Quiz unlock'
        : options.purpose;

  const subject = `Payment ${options.status.toLowerCase()} — ${amount}`;
  const text = [
    `Hi ${displayName},`,
    '',
    `Your payment was marked as ${options.status}. No access was unlocked for this attempt.`,
    '',
    `Purpose: ${purposeLabel}`,
    options.quizTitle ? `Quiz: ${options.quizTitle}` : '',
    `Amount: ${amount}`,
    `Order ID: ${options.orderId}`,
    '',
    'You can try again from the quiz catalog or checkout page.',
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailLayout({
    subject,
    title: `Payment ${options.status.toLowerCase()}`,
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: subject,
    bodyHtml: `
              ${p(`Your payment was marked as <strong>${escapeHtml(options.status)}</strong>. No access was unlocked for this attempt.`)}
              ${detailsTable(
                detailRow('Purpose', purposeLabel) +
                  (options.quizTitle
                    ? detailRow('Quiz', options.quizTitle)
                    : '') +
                  detailRow('Amount', amount) +
                  detailRow('Order ID', options.orderId),
              )}
              ${p('You can try again from the quiz catalog or checkout page.')}`,
    ctaUrl: quizUrl,
    ctaLabel: 'Browse quizzes',
  });

  return { subject, text, html };
}

export function buildSlipReviewedEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  status: 'Approved' | 'Rejected';
  quizTitle?: string | null;
  note?: string | null;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const approved = options.status === 'Approved';
  const ctaUrl = approved ? `${base}/quiz` : `${base}/payments`;

  const subject = approved
    ? 'Bank slip approved — access unlocked'
    : 'Bank slip rejected — Kadaima';

  const text = [
    `Hi ${displayName},`,
    '',
    approved
      ? 'Your bank slip was approved. Access has been unlocked.'
      : 'Your bank slip was rejected. Please submit a clearer slip or contact support.',
    options.quizTitle ? `Quiz: ${options.quizTitle}` : '',
    options.note ? `Note: ${options.note}` : '',
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailLayout({
    subject,
    title: approved ? 'Slip approved' : 'Slip rejected',
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: subject,
    bodyHtml: `
              ${p(
                approved
                  ? 'Your bank slip was <strong>approved</strong>. Access has been unlocked on your account.'
                  : 'Your bank slip was <strong>rejected</strong>. Please submit a clearer slip or contact support.',
              )}
              ${
                options.quizTitle || options.note
                  ? detailsTable(
                      (options.quizTitle
                        ? detailRow('Quiz', options.quizTitle)
                        : '') +
                        (options.note ? detailRow('Note', options.note) : ''),
                    )
                  : ''
              }`,
    ctaUrl,
    ctaLabel: approved ? 'Open quizzes' : 'View payments',
  });

  return { subject, text, html };
}

export function buildTeacherPayoutEmail(options: {
  recipientEmail: string;
  userName?: string;
  frontendUrl: string;
  supportEmail?: string;
  status: TeacherPayoutEmailStatus;
  amountLkr: number;
  periodLabel: string;
  attemptCount?: number | null;
  reference?: string | null;
  currency?: string;
}): EmailContent {
  const supportEmail = options.supportEmail || 'support@kadaima.com';
  const displayName = displayNameFrom(options);
  const base = options.frontendUrl.replace(/\/$/, '');
  const earningsUrl = `${base}/admin/earnings`;
  const currency = options.currency || 'LKR';
  const amount = `${currency} ${Number(options.amountLkr).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  const copy: Record<
    TeacherPayoutEmailStatus,
    { subject: string; title: string; lead: string; cta: string }
  > = {
    Pending: {
      subject: `Payroll ready — ${amount} for ${options.periodLabel}`,
      title: 'Your payroll is ready',
      lead: `Your teacher earnings for <strong>${escapeHtml(options.periodLabel)}</strong> have been calculated and a payout of <strong>${escapeHtml(amount)}</strong> is now Pending.`,
      cta: 'View earnings',
    },
    Approved: {
      subject: `Payout approved — ${amount}`,
      title: 'Payout approved',
      lead: `Your payout of <strong>${escapeHtml(amount)}</strong> for <strong>${escapeHtml(options.periodLabel)}</strong> was approved and will be transferred soon.`,
      cta: 'View earnings',
    },
    Paid: {
      subject: `Payment completed — ${amount}`,
      title: 'Payment completed',
      lead: `Great news! Your teacher payout of <strong>${escapeHtml(amount)}</strong> for <strong>${escapeHtml(options.periodLabel)}</strong> has been marked as <strong>Paid</strong>.`,
      cta: 'View earnings',
    },
    Held: {
      subject: `Payout on hold — ${amount}`,
      title: 'Payout on hold',
      lead: `Your payout of <strong>${escapeHtml(amount)}</strong> for <strong>${escapeHtml(options.periodLabel)}</strong> is currently <strong>Held</strong>. Please update your bank payout profile or contact support.`,
      cta: 'Update payout profile',
    },
  };

  const meta = copy[options.status];
  const textLead = meta.lead.replace(/<[^>]+>/g, '');

  const text = [
    `Hi ${displayName},`,
    '',
    textLead,
    '',
    `Period: ${options.periodLabel}`,
    `Amount: ${amount}`,
    `Status: ${options.status}`,
    options.attemptCount != null ? `Billable attempts: ${options.attemptCount}` : '',
    options.reference ? `Reference: ${options.reference}` : '',
    '',
    `Open earnings: ${earningsUrl}`,
    '',
    `Support: ${supportEmail}`,
    '',
    'The Kadaima Educational Team',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailLayout({
    subject: meta.subject,
    title: meta.title,
    displayName,
    frontendUrl: base,
    supportEmail,
    preheader: meta.subject,
    bodyHtml: `
              ${p(meta.lead)}
              ${detailsTable(
                detailRow('Period', options.periodLabel) +
                  detailRow('Amount', amount) +
                  detailRow('Status', options.status) +
                  (options.attemptCount != null
                    ? detailRow('Billable attempts', String(options.attemptCount))
                    : '') +
                  (options.reference
                    ? detailRow('Reference', options.reference)
                    : ''),
              )}
              ${p('You can review monthly shares and bank details anytime on your Earnings page.')}`,
    ctaUrl: earningsUrl,
    ctaLabel: meta.cta,
  });

  return { subject: meta.subject, text, html };
}

export function buildEmailByKind(
  kind: EmailTemplateKind,
  options: {
    recipientEmail: string;
    userName?: string;
    frontendUrl: string;
    supportEmail?: string;
  },
): EmailContent {
  const common = {
    recipientEmail: options.recipientEmail,
    userName: options.userName,
    frontendUrl: options.frontendUrl,
    supportEmail: options.supportEmail,
  };

  switch (kind) {
    case 'password-reset':
      return buildPasswordResetEmail({ ...common, code: '123456', expiresMinutes: 10 });
    case 'password-changed':
      return buildPasswordChangedEmail({ ...common, reason: 'changed' });
    case 'welcome':
      return buildWelcomeEmail({ ...common, accountType: 'student' });
    case 'invite':
      return buildInviteEmail({ ...common, invitedByName: 'Kadaima Admin' });
    case 'teacher-activated':
      return buildTeacherActivatedEmail(common);
    case 'payment-receipt':
      return buildPaymentReceiptEmail({
        ...common,
        purpose: 'SUBSCRIPTION',
        amountLkr: 500,
        orderId: 'ORD-PREVIEW-001',
      });
    case 'payment-failed':
      return buildPaymentFailedEmail({
        ...common,
        purpose: 'QUIZ',
        amountLkr: 250,
        orderId: 'ORD-PREVIEW-002',
        status: 'Failed',
        quizTitle: 'Sample Quiz',
      });
    case 'slip-reviewed':
      return buildSlipReviewedEmail({
        ...common,
        status: 'Approved',
        quizTitle: 'Sample Quiz',
      });
    case 'teacher-payout-pending':
      return buildTeacherPayoutEmail({
        ...common,
        status: 'Pending',
        amountLkr: 12500,
        periodLabel: 'July 2026',
        attemptCount: 48,
      });
    case 'teacher-payout-approved':
      return buildTeacherPayoutEmail({
        ...common,
        status: 'Approved',
        amountLkr: 12500,
        periodLabel: 'July 2026',
        attemptCount: 48,
      });
    case 'teacher-payout-paid':
      return buildTeacherPayoutEmail({
        ...common,
        status: 'Paid',
        amountLkr: 12500,
        periodLabel: 'July 2026',
        attemptCount: 48,
        reference: 'TRF-202607-001',
      });
    case 'teacher-payout-held':
      return buildTeacherPayoutEmail({
        ...common,
        status: 'Held',
        amountLkr: 12500,
        periodLabel: 'July 2026',
      });
    default:
      return buildWelcomeEmail({ ...common, accountType: 'student' });
  }
}
