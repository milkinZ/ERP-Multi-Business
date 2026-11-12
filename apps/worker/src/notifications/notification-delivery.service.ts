import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../shared/prisma.service";
import { NotificationEmailSender } from "./notification-email.sender";
import type { NotificationDispatchJobPayload } from "../queue/queue.types";

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: NotificationEmailSender,
  ) {}

  async dispatch(job: NotificationDispatchJobPayload): Promise<void> {
    if (!job.notification.channels.includes("EMAIL")) return;

    const recipient = await this.prisma.user.findFirst({
      where: {
        id: job.recipientId,
        tenantId: job.tenantId,
        isActive: true,
        deletedAt: null,
      },
      select: { email: true },
    });
    if (!recipient) {
      this.logger.warn(
        `Skipping email notification for inactive or missing tenant user tenant=${job.tenantId} user=${job.recipientId}`,
      );
      return;
    }

    const preference = await this.prisma.notificationPreference.findFirst({
      where: {
        tenantId: job.tenantId,
        userId: job.recipientId,
        category: job.notification.category,
        channel: "EMAIL",
        enabled: false,
      },
      select: { id: true },
    });
    if (preference) return;

    await this.emailSender.send(
      recipient.email,
      job.notification.title ?? "ERP notification",
      job.notification.message ?? "A new ERP notification is available.",
    );
  }
}
