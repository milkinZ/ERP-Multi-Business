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
  DOMAIN_EVENT = 'DOMAIN_EVENT',
}

export enum NotificationCategory {
  PRODUCTS = 'PRODUCTS',
  ORDERS = 'ORDERS',
  PAYMENTS = 'PAYMENTS',
  INVENTORY = 'INVENTORY',
  PROCUREMENT = 'PROCUREMENT',
  KITCHEN = 'KITCHEN',
  USERS = 'USERS',
  BUSINESS = 'BUSINESS',
  FEATURE_FLAGS = 'FEATURE_FLAGS',
  SUBSCRIPTIONS = 'SUBSCRIPTIONS',
  BILLING = 'BILLING',
}

export const NOTIFICATION_CATEGORIES = Object.values(NotificationCategory);

import { NotificationTemplateContextValue } from './notification.factory';

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
}

export interface NotificationPayload {
  type: NotificationType;
  category: NotificationCategory;
  channels?: NotificationChannel[];
  tenantId: string;
  userId: string;
  outletId?: string;
  sourceEventId: string;
  title?: string;
  message?: string;
  data?: Record<string, NotificationTemplateContextValue>;
}

export interface NotificationDispatchJobPayload {
  recipientId: string;
  tenantId: string;
  outletId?: string;
  notification: {
    type: NotificationType;
    category: NotificationCategory;
    sourceEventId: string;
    title?: string;
    message?: string;
    channels: NotificationChannel[];
    data?: Record<string, NotificationTemplateContextValue>;
  };
}
