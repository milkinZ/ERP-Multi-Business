import {
  NotificationChannel,
  NotificationDispatchJobPayload,
} from './notification.types';

export const NOTIFICATION_CHANNEL_HANDLERS = 'NOTIFICATION_CHANNEL_HANDLERS';

export interface NotificationChannelHandler {
  channel: NotificationChannel;
  send(job: NotificationDispatchJobPayload): Promise<void>;
}
