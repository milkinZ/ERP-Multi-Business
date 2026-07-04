import { Injectable } from '@nestjs/common';
import {
  NotificationFactory,
  NotificationTemplateContext,
} from './notification.factory';
import { NotificationType, NotificationChannel } from './notification.types';

@Injectable()
export class NotificationTemplateService {
  constructor(private readonly factory: NotificationFactory) {}

  buildNotification(
    type: NotificationType,
    context: NotificationTemplateContext,
    channels?: NotificationChannel[],
  ) {
    const template = this.factory.getTemplate(type);
    const rendered = this.factory.buildTemplateContext(type, context);

    return {
      type,
      channels: channels ?? template.defaultChannels,
      title: rendered.title,
      message: rendered.message,
      data: context,
    };
  }
}
