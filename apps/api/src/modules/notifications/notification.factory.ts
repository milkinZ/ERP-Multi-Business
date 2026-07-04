import { Injectable } from '@nestjs/common';
import { NotificationType, NotificationChannel } from './notification.types';

export type NotificationTemplateContextValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface NotificationTemplateContext {
  user?: string;
  orderNumber?: string;
  amount?: number;
  paymentMethod?: string;
  outlet?: string;
  [key: string]: NotificationTemplateContextValue;
}

export interface NotificationTemplate {
  type: NotificationType;
  defaultChannels: NotificationChannel[];
  titleTemplate: string;
  messageTemplate: string;
}

@Injectable()
export class NotificationFactory {
  private readonly templates: NotificationTemplate[] = [
    {
      type: NotificationType.ORDER_CREATED,
      defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      titleTemplate: 'Order {{orderNumber}} created',
      messageTemplate:
        'Hello {{user}}, your order {{orderNumber}} has been created successfully.',
    },
    {
      type: NotificationType.ORDER_COMPLETED,
      defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      titleTemplate: 'Order {{orderNumber}} completed',
      messageTemplate:
        'Good news {{user}}, your order {{orderNumber}} is completed.',
    },
    {
      type: NotificationType.PAYMENT_PAID,
      defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      titleTemplate: 'Payment received',
      messageTemplate:
        'Hello {{user}}, payment for order {{orderNumber}} of amount {{amount}} has been received.',
    },
    {
      type: NotificationType.LOW_STOCK,
      defaultChannels: [NotificationChannel.IN_APP],
      titleTemplate: 'Low stock alert',
      messageTemplate:
        'Inventory item {{outlet}} is low on stock. Please review the item.',
    },
    {
      type: NotificationType.PO_RECEIVED,
      defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      titleTemplate: 'Purchase order received',
      messageTemplate:
        'Purchase order {{orderNumber}} has been received successfully.',
    },
    {
      type: NotificationType.WELCOME,
      defaultChannels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      titleTemplate: 'Welcome {{user}}',
      messageTemplate: 'Welcome to the platform, {{user}}.',
    },
  ];

  getTemplate(type: NotificationType): NotificationTemplate {
    const template = this.templates.find((item) => item.type === type);
    if (!template) {
      throw new Error(`Notification template not found for type ${type}`);
    }
    return template;
  }

  buildTemplateContext(
    type: NotificationType,
    context: NotificationTemplateContext,
  ) {
    const template = this.getTemplate(type);
    return {
      ...template,
      title: this.render(template.titleTemplate, context),
      message: this.render(template.messageTemplate, context),
    };
  }

  private render(template: string, context: NotificationTemplateContext) {
    return template.replace(/{{(\w+)}}/g, (_, key) => {
      const value = context[key as keyof NotificationTemplateContext];
      if (value === undefined || value === null) {
        return '';
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value);
      }
      return '';
    });
  }
}
