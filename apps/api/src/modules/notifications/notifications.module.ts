import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationFactory } from './notification.factory';
import { NotificationTemplateService } from './notification.template.service';
import { NotificationPreferenceService } from './notification.preference.service';
import { NotificationEventSubscriber } from './notification.event-subscriber';
import { EmailNotificationChannelHandler } from './notification.email.handler';
import { InAppNotificationChannelHandler } from './notification.in-app.handler';
import { NOTIFICATION_CHANNEL_HANDLERS } from './notification.channel';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationFactory,
    NotificationTemplateService,
    NotificationPreferenceService,
    NotificationEventSubscriber,
    EmailNotificationChannelHandler,
    InAppNotificationChannelHandler,
    {
      provide: NOTIFICATION_CHANNEL_HANDLERS,
      useFactory: (
        emailHandler: EmailNotificationChannelHandler,
        inAppHandler: InAppNotificationChannelHandler,
      ) => [emailHandler, inAppHandler],
      inject: [
        EmailNotificationChannelHandler,
        InAppNotificationChannelHandler,
      ],
    },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
