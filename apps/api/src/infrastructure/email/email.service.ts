import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');
    this.from = config.get<string>('EMAIL_FROM') ?? 'no-reply@erp.local';
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') ?? '127.0.0.1',
      port: config.get<number>('SMTP_PORT') ?? 1025,
      secure: config.get<string>('SMTP_SECURE') === 'true',
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  async sendUserInvitation(email: string, setupUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Your ERP Multi-Business invitation',
      text: [
        'You have been invited to join an ERP Multi-Business workspace.',
        '',
        'Use the one-time link below to set your password:',
        setupUrl,
        '',
        'This invitation expires in seven days. If you did not expect it, you can ignore this message.',
      ].join('\n'),
    });
  }
}
