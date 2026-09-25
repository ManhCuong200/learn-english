import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    this.resend = new Resend(apiKey);
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: 'English Learning <onboarding@resend.dev>',
      to: [email],
      subject: 'Reset your password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Reset your password</h1>

          <p>
            We received a request to reset your password.
          </p>

          <p>
            Click the button below to create a new password.
          </p>

          <a
            href="${resetUrl}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #000;
              color: #fff;
              text-decoration: none;
              border-radius: 6px;
            "
          >
            Reset Password
          </a>

          <p style="margin-top: 24px; color: #666;">
            This link will expire in 15 minutes.
          </p>

          <p style="color: #666;">
            If you did not request a password reset, you can ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);

      throw new InternalServerErrorException(error.message);
    }
  }

  async sendSecurityAlertEmail(
    email: string,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: 'English Learning <onboarding@resend.dev>',
      to: [email],
      subject: 'New login detected',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>New Login Detected</h1>
          <p>We noticed a new login to your account from a new device or location.</p>
          <ul>
            <li><strong>IP Address:</strong> ${ip}</li>
            <li><strong>Device/Browser:</strong> ${userAgent}</li>
            <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p>If this was you, you can ignore this email. If you don't recognize this activity, please change your password immediately and review your active sessions.</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error (security alert):', error);
      // We don't throw error here to not block the login process
    }
  }
}
