import {
  NotificationCategory,
  NotificationChannel,
  NotificationType,
} from './notification.types';
import { NotificationService } from './notification.service';
import { NotificationTemplateService } from './notification.template.service';
import { NotificationPreferenceService } from './notification.preference.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationRecipientService } from './notification-recipient.service';

describe('NotificationService', () => {
  const buildNotification = jest.fn();
  const getEffectiveChannels = jest.fn();
  const send = jest.fn();
  const notificationUpdateMany = jest.fn();
  const findForOutlet = jest.fn();
  const findForTenant = jest.fn();
  const prisma = {
    notification: { updateMany: notificationUpdateMany },
  } as unknown as PrismaService;
  const templates = {
    buildNotification,
  } as unknown as NotificationTemplateService;
  const preferences = {
    getEffectiveChannels,
  } as unknown as NotificationPreferenceService;
  const handlers = [{ channel: NotificationChannel.EMAIL, send }] as never;
  const recipients = {
    findForOutlet,
    findForTenant,
  } as unknown as NotificationRecipientService;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationUpdateMany.mockResolvedValue({ count: 1 });
    buildNotification.mockReturnValue({
      title: 'Order created',
      message: 'Your order was created',
      channels: [NotificationChannel.EMAIL],
    });
    getEffectiveChannels.mockReturnValue([NotificationChannel.EMAIL]);
    send.mockResolvedValue(undefined);
    findForOutlet.mockResolvedValue([]);
    findForTenant.mockResolvedValue([]);
    service = new NotificationService(
      prisma,
      templates,
      preferences,
      recipients,
      handlers,
    );
  });

  it('builds a tenant-scoped dispatch payload and delivers through matching handlers', async () => {
    await service.sendNotification({
      type: NotificationType.ORDER_CREATED,
      category: NotificationCategory.ORDERS,
      sourceEventId: 'event-a',
      tenantId: 'tenant-a',
      userId: 'user-a',
      data: {},
    });

    expect(send).toHaveBeenCalledWith({
      recipientId: 'user-a',
      tenantId: 'tenant-a',
      notification: {
        type: NotificationType.ORDER_CREATED,
        category: NotificationCategory.ORDERS,
        sourceEventId: 'event-a',
        title: 'Order created',
        message: 'Your order was created',
        channels: [NotificationChannel.EMAIL],
        data: {},
      },
    });
  });

  it('does not invoke handlers when preferences remove every channel', async () => {
    getEffectiveChannels.mockReturnValue([]);

    await expect(
      service.sendNotification({
        type: NotificationType.ORDER_CREATED,
        category: NotificationCategory.ORDERS,
        sourceEventId: 'event-a',
        tenantId: 'tenant-a',
        userId: 'user-a',
      }),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates delivery failure and does not hide a failed notification', async () => {
    send.mockRejectedValue(new Error('email provider unavailable'));

    await expect(
      service.sendNotification({
        type: NotificationType.ORDER_CREATED,
        category: NotificationCategory.ORDERS,
        sourceEventId: 'event-a',
        tenantId: 'tenant-a',
        userId: 'user-a',
      }),
    ).rejects.toThrow('email provider unavailable');
  });

  it('scopes individual read and delete mutations to the notification owner', async () => {
    await service.markAsRead('notification-a', 'user-a', 'tenant-a');
    await service.deleteNotification('notification-a', 'user-a', 'tenant-a');

    type MutationCall = {
      where: {
        id: string;
        userId: string;
        tenantId: string;
        deletedAt: null;
      };
      data: { readAt?: Date; deletedAt?: Date };
    };
    const calls = notificationUpdateMany.mock.calls as Array<[MutationCall]>;

    expect(calls.map(([call]) => call.where)).toEqual([
      {
        id: 'notification-a',
        userId: 'user-a',
        tenantId: 'tenant-a',
        deletedAt: null,
      },
      {
        id: 'notification-a',
        userId: 'user-a',
        tenantId: 'tenant-a',
        deletedAt: null,
      },
    ]);
    expect(calls[0][0].data.readAt).toBeInstanceOf(Date);
    expect(calls[1][0].data.deletedAt).toBeInstanceOf(Date);
  });
});
