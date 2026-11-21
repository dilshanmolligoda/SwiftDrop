import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;
  private readonly enabled: boolean;
  private readonly from: string;
  private readonly webAppUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('NOTIFY_EMAIL_ENABLED', 'true') !==
      'false';
    const host = this.configService.get<string>('SMTP_HOST', 'localhost');
    const port = Number(this.configService.get<number>('SMTP_PORT', 1025));
    const user = this.configService.get<string>('SMTP_USER', '');
    const pass = this.configService.get<string>('SMTP_PASSWORD', '');
    this.from = this.configService.get<string>(
      'SMTP_FROM',
      'SwiftDrop <no-reply@swiftdrop.local>',
    );
    this.webAppUrl = this.configService.get<string>(
      'WEB_APP_URL',
      'http://localhost:5173',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      ignoreTLS: port === 1025,
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        `Email sending disabled. Skipped email to ${options.to} [Subject: ${options.subject}]`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(
        `Successfully sent email to ${options.to} [Subject: ${options.subject}]`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async sendCustomerWelcomeEmail(to: string, fullName: string): Promise<void> {
    const loginUrl = `${this.webAppUrl.replace(/\/+$/, '')}/login`;
    const subject = 'Welcome to SwiftDrop — Fast & Reliable Parcel Delivery';
    const html = this.renderCustomerWelcomeHtml(fullName, loginUrl);
    const text = `Hello ${fullName},\n\nWelcome to SwiftDrop — Fast & Reliable Parcel Delivery!\n\nHere is what you can do with your new customer account:\n- Live Tracking: Real-time parcel status and tracking timeline.\n- Instant Fee Estimation: Calculate upfront, transparent shipping rates.\n- Easy Parcel Booking: Schedule doorstep pickups and deliveries anytime.\n\nStart now by logging in to your account:\n${loginUrl}\n\nBest regards,\nThe SwiftDrop Team`;

    await this.sendMail({
      to,
      subject,
      html,
      text,
    });
  }

  async sendWelcomeEmail(to: string, fullName: string): Promise<void> {
    return this.sendCustomerWelcomeEmail(to, fullName);
  }

  async sendPasswordResetEmail(
    to: string,
    token: string,
    fullName?: string,
  ): Promise<void> {
    const resetUrl = `${this.webAppUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Reset your SwiftDrop password';
    const html = this.renderPasswordResetHtml(fullName, resetUrl);
    const text = fullName
      ? `Hello ${fullName},\n\nWe received a request to reset the password for your SwiftDrop account.\n\nTo reset your password, please click the link below:\n${resetUrl}\n\nThis link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nThe SwiftDrop Team`
      : `Hello,\n\nWe received a request to reset the password for your SwiftDrop account.\n\nTo reset your password, please click the link below:\n${resetUrl}\n\nThis link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nThe SwiftDrop Team`;

    await this.sendMail({
      to,
      subject,
      html,
      text,
    });
  }

  async sendPasswordResetConfirmationEmail(
    to: string,
    fullName?: string,
  ): Promise<void> {
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    const formattedTimestamp = `${timeFormatter.format(new Date())} (Asia/Colombo)`;
    const supportUrl = `${this.webAppUrl.replace(/\/+$/, '')}/support`;
    const subject = 'Security Alert: Your SwiftDrop password was reset';
    const html = this.renderPasswordResetConfirmationHtml(
      fullName,
      formattedTimestamp,
      supportUrl,
    );
    const greeting = fullName ? `Hello ${fullName},` : 'Hello,';
    const text = `${greeting}\n\nThis is a security alert to confirm that the password for your SwiftDrop account was successfully reset on ${formattedTimestamp}.\n\nIf you performed this password reset, no further action is required.\n\nIMPORTANT SECURITY NOTICE:\nIf you did not authorize this change, please contact SwiftDrop security immediately at security@swiftdrop.local or visit:\n${supportUrl}\n\nBest regards,\nThe SwiftDrop Security Team`;

    await this.sendMail({
      to,
      subject,
      html,
      text,
    });
  }

  async sendPasswordChangedSettingsEmail(
    to: string,
    fullName?: string,
    deviceInfo?: string,
  ): Promise<void> {
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    const formattedTimestamp = `${timeFormatter.format(new Date())} (Asia/Colombo)`;
    const resetUrl = `${this.webAppUrl.replace(/\/+$/, '')}/forgot-password`;
    const subject = 'Security Notice: Password changed';
    const html = this.renderPasswordChangedSettingsHtml(
      fullName,
      formattedTimestamp,
      deviceInfo,
      resetUrl,
    );
    const greeting = fullName ? `Hello ${fullName},` : 'Hello,';
    const deviceLine = deviceInfo ? `\nDevice / Browser: ${deviceInfo}` : '';
    const text = `${greeting}\n\nThe password for your SwiftDrop account was recently changed from settings on ${formattedTimestamp}.${deviceLine}\n\nIf you did not make this change, please reset your password immediately:\n${resetUrl}\n\nBest regards,\nThe SwiftDrop Security Team`;

    await this.sendMail({
      to,
      subject,
      html,
      text,
    });
  }

  private renderCustomerWelcomeHtml(
    fullName: string,
    loginUrl: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SwiftDrop</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .brand-title {
      color: #ffffff;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      color: #93c5fd;
      font-size: 14px;
      font-weight: 500;
      margin-top: 6px;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin: 0 0 28px 0;
    }
    .features-list {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .feature-item:last-child {
      margin-bottom: 0;
    }
    .feature-bullet {
      color: #2563eb;
      font-weight: bold;
      font-size: 18px;
      margin-right: 12px;
      line-height: 1.2;
    }
    .feature-text strong {
      color: #0f172a;
      display: block;
      font-size: 14px;
      margin-bottom: 2px;
    }
    .feature-text span {
      color: #64748b;
      font-size: 13px;
      line-height: 1.4;
    }
    .cta-container {
      text-align: center;
      margin: 32px 0 24px 0;
    }
    .cta-button {
      background-color: #2563eb;
      color: #ffffff !important;
      display: inline-block;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
    }
    .cta-hint {
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
      margin-top: 12px;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td class="header" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 36px 32px; text-align: center;">
              <h1 class="brand-title" style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SwiftDrop</h1>
              <div class="brand-subtitle" style="color: #93c5fd; font-size: 14px; font-weight: 500; margin-top: 6px;">Island-wide Parcel Delivery & Courier Management</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 36px 32px;">
              <h2 class="greeting" style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">Hello, ${fullName}!</h2>
              <p class="intro" style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
                Welcome to SwiftDrop! We are excited to have you on board. Your customer account is active and ready for fast, safe, and transparent parcel delivery across the island.
              </p>
              
              <!-- Features -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="top" style="padding-bottom: 14px;">
                          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Live Tracking</div>
                          <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Track your package status in real time with interactive timeline updates.</div>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding-bottom: 14px;">
                          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Instant Fee Estimation</div>
                          <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Preview delivery fees transparently based on distance, weight, and size.</div>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top">
                          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Seamless Parcel Booking</div>
                          <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Book doorstep pickups and deliveries with dedicated courier dispatch.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Call to Action -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff !important; display: inline-block; font-size: 15px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 8px;">
                      Log In to Your Account
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 12px;">
                    <span style="font-size: 12px; color: #94a3b8;">Or visit: <a href="${loginUrl}" style="color: #2563eb; text-decoration: underline;">${loginUrl}</a></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              SwiftDrop - Fast &amp; Reliable Parcel Delivery<br>
              If you didn't create an account, you can safely ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderPasswordResetHtml(
    fullName: string | undefined,
    resetUrl: string,
  ): string {
    const greeting = fullName ? `Hello, ${fullName}!` : 'Hello!';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your SwiftDrop password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .brand-title {
      color: #ffffff;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      color: #93c5fd;
      font-size: 14px;
      font-weight: 500;
      margin-top: 6px;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin: 0 0 20px 0;
    }
    .warning-box {
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .warning-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 4px;
    }
    .warning-text {
      font-size: 13px;
      color: #3b82f6;
      line-height: 1.5;
    }
    .cta-button {
      background-color: #2563eb;
      color: #ffffff !important;
      display: inline-block;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
    }
    .cta-hint {
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
      margin-top: 12px;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td class="header" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 36px 32px; text-align: center;">
              <h1 class="brand-title" style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SwiftDrop</h1>
              <div class="brand-subtitle" style="color: #93c5fd; font-size: 14px; font-weight: 500; margin-top: 6px;">Island-wide Parcel Delivery & Courier Management</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 36px 32px;">
              <h2 class="greeting" style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">${greeting}</h2>
              <p class="intro" style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                We received a request to reset your password for your SwiftDrop account. Click the button below to choose a new password.
              </p>
              
              <!-- Expiration Warning Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">Important Note</div>
                    <div style="font-size: 13px; color: #1e3a8a; line-height: 1.5;">This password reset link will expire in 15 minutes. For security reasons, it can only be used once.</div>
                  </td>
                </tr>
              </table>

              <!-- Call to Action -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff !important; display: inline-block; font-size: 15px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 14px;">
                    <span style="font-size: 12px; color: #94a3b8; word-break: break-all;">Or visit: <a href="${resetUrl}" style="color: #2563eb; text-decoration: underline;">${resetUrl}</a></span>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 24px 0 0 0;">
                If you did not request a password reset, you can safely ignore this email. Your current password remains unchanged.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              SwiftDrop - Fast &amp; Reliable Parcel Delivery<br>
              If you have any questions, please contact our support team.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderPasswordResetConfirmationHtml(
    fullName: string | undefined,
    timestamp: string,
    supportUrl: string,
  ): string {
    const greeting = fullName ? `Hello, ${fullName}!` : 'Hello!';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert: Your SwiftDrop password was reset</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .brand-title {
      color: #ffffff;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      color: #93c5fd;
      font-size: 14px;
      font-weight: 500;
      margin-top: 6px;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin: 0 0 20px 0;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .info-row {
      font-size: 13px;
      line-height: 1.6;
      color: #475569;
    }
    .info-label {
      font-weight: 600;
      color: #1e293b;
    }
    .alert-box {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 28px;
    }
    .alert-title {
      font-size: 14px;
      font-weight: 700;
      color: #991b1b;
      margin-bottom: 6px;
    }
    .alert-text {
      font-size: 13px;
      color: #b91c1c;
      line-height: 1.5;
    }
    .cta-button {
      background-color: #dc2626;
      color: #ffffff !important;
      display: inline-block;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 8px;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td class="header" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 36px 32px; text-align: center;">
              <h1 class="brand-title" style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SwiftDrop</h1>
              <div class="brand-subtitle" style="color: #93c5fd; font-size: 14px; font-weight: 500; margin-top: 6px;">Island-wide Parcel Delivery & Courier Management</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 36px 32px;">
              <h2 class="greeting" style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">${greeting}</h2>
              <p class="intro" style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                This is a confirmation that your SwiftDrop account password was successfully reset and updated.
              </p>
              
              <!-- Timestamp Detail Box -->
              <div class="info-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
                <div class="info-row" style="font-size: 13px; line-height: 1.6; color: #475569;">
                  <span class="info-label" style="font-weight: 600; color: #1e293b;">Time of Reset:</span> ${timestamp}
                </div>
                <div class="info-row" style="font-size: 13px; line-height: 1.6; color: #475569; margin-top: 6px;">
                  <span class="info-label" style="font-weight: 600; color: #1e293b;">Status:</span> Completed successfully
                </div>
              </div>

              <!-- Urgent Security Notice -->
              <div class="alert-box" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px;">
                <div class="alert-title" style="font-size: 14px; font-weight: 700; color: #991b1b; margin-bottom: 6px;">Did you not request this change?</div>
                <div class="alert-text" style="font-size: 13px; color: #b91c1c; line-height: 1.5;">
                  If you did not perform this password reset, your account might be compromised. Please contact our security team immediately to secure your account.
                </div>
              </div>

              <!-- Action Link -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${supportUrl}" target="_blank" style="background-color: #dc2626; color: #ffffff !important; display: inline-block; font-size: 15px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 8px;">
                      Contact Security Support
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 14px;">
                    <span style="font-size: 12px; color: #94a3b8;">Or reach us directly at: <a href="mailto:security@swiftdrop.local" style="color: #dc2626; text-decoration: underline;">security@swiftdrop.local</a></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              SwiftDrop - Fast &amp; Reliable Parcel Delivery<br>
              Automated Security Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderPasswordChangedSettingsHtml(
    fullName: string | undefined,
    timestamp: string,
    deviceInfo: string | undefined,
    resetUrl: string,
  ): string {
    const greeting = fullName ? `Hello, ${fullName}!` : 'Hello!';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Notice: Password changed</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      padding: 36px 32px;
      text-align: center;
    }
    .brand-title {
      color: #ffffff;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-subtitle {
      color: #93c5fd;
      font-size: 14px;
      font-weight: 500;
      margin-top: 6px;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
      margin: 0 0 20px 0;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .info-row {
      font-size: 13px;
      line-height: 1.6;
      color: #475569;
    }
    .info-label {
      font-weight: 600;
      color: #1e293b;
    }
    .alert-box {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 28px;
    }
    .alert-title {
      font-size: 14px;
      font-weight: 700;
      color: #991b1b;
      margin-bottom: 6px;
    }
    .alert-text {
      font-size: 13px;
      color: #b91c1c;
      line-height: 1.5;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td class="header" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 36px 32px; text-align: center;">
              <h1 class="brand-title" style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SwiftDrop</h1>
              <div class="brand-subtitle" style="color: #93c5fd; font-size: 14px; font-weight: 500; margin-top: 6px;">Island-wide Parcel Delivery & Courier Management</div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 36px 32px;">
              <h2 class="greeting" style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">${greeting}</h2>
              <p class="intro" style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                The password for your SwiftDrop account was recently changed from settings on ${timestamp}.
              </p>
              
              <!-- Timestamp & Device Box -->
              <div class="info-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
                <div class="info-row" style="font-size: 13px; line-height: 1.6; color: #475569;">
                  <span class="info-label" style="font-weight: 600; color: #1e293b;">Date &amp; Time:</span> ${timestamp}
                </div>
                ${
                  deviceInfo
                    ? `<div class="info-row" style="font-size: 13px; line-height: 1.6; color: #475569; margin-top: 6px;">
                  <span class="info-label" style="font-weight: 600; color: #1e293b;">Device / Browser:</span> ${deviceInfo}
                </div>`
                    : ''
                }
              </div>

              <!-- Urgent Security Notice -->
              <div class="alert-box" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px;">
                <div class="alert-title" style="font-size: 14px; font-weight: 700; color: #991b1b; margin-bottom: 6px;">Did you not make this change?</div>
                <div class="alert-text" style="font-size: 13px; color: #b91c1c; line-height: 1.5;">
                  If you did not make this change, please reset your password immediately to protect your account.
                </div>
              </div>

              <!-- Call to Action -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="background-color: #dc2626; color: #ffffff !important; display: inline-block; font-size: 15px; font-weight: 600; padding: 14px 32px; text-decoration: none; border-radius: 8px;">
                      Reset Your Password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              SwiftDrop - Fast &amp; Reliable Parcel Delivery<br>
              Automated Security Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
