import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

@Injectable()
export class NotificationEmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const host = process.env.SMTP_HOST ?? "127.0.0.1";
    const port = Number(process.env.SMTP_PORT ?? 1025);
    this.from = process.env.EMAIL_FROM ?? "no-reply@erp.local";

    if (Boolean(user) !== Boolean(password)) {
      throw new Error(
        "SMTP_USER and SMTP_PASSWORD must be configured together",
      );
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP_PORT must be a valid TCP port");
    }
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.SMTP_HOST || !process.env.EMAIL_FROM)
    ) {
      throw new Error(
        "SMTP_HOST and EMAIL_FROM must be configured in production",
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  async send(to: string, subject: string, text: string) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
    });
  }
}
