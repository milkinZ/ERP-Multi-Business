export enum NotificationType {
  // Order notifications
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_PAID = 'ORDER_PAID',
  ORDER_READY = 'ORDER_READY',
  ORDER_COMPLETED = 'ORDER_COMPLETED',

  // Payment notifications
  PAYMENT_CREATED = 'PAYMENT_CREATED',
  PAYMENT_PAID = 'PAYMENT_PAID',
  PAYMENT_FAILED = 'PAYMENT_FAILED',

  // Inventory notifications
  LOW_STOCK = 'LOW_STOCK',
  STOCK_UPDATED = 'STOCK_UPDATED',

  // PO notifications
  PO_CREATED = 'PO_CREATED',
  PO_APPROVED = 'PO_APPROVED',
  PO_RECEIVED = 'PO_RECEIVED',

  // System notifications
  WELCOME = 'WELCOME',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

import { NotificationTemplateContextValue } from './notification.factory';

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
}

export interface NotificationPayload {
  type: NotificationType;
  channels?: NotificationChannel[];
  tenantId: string;
  userId?: string;
  outletId?: string;
  title?: string;
  message?: string;
  data?: Record<string, NotificationTemplateContextValue>;
}

export interface NotificationDispatchJobPayload {
  recipientId?: string;
  tenantId: string;
  notification: {
    type: NotificationType;
    title?: string;
    message?: string;
    channels: NotificationChannel[];
    data?: Record<string, NotificationTemplateContextValue>;
  };
}
