import { Injectable } from '@nestjs/common';
import { NotificationChannel } from './notification.types';

@Injectable()
export class NotificationPreferenceService {
  getUserPreferences(): Record<NotificationChannel, boolean> {
    return {} as Record<NotificationChannel, boolean>;
  }

  getEffectiveChannels(
    userId: string | undefined,
    requestedChannels: NotificationChannel[],
  ) {
    if (!userId) {
      return requestedChannels;
    }

    const preferences = this.getUserPreferences();
    return requestedChannels.filter(
      (channel) => preferences[channel] !== false,
    );
  }
}
