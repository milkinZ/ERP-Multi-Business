import { NotificationChannel, NotificationType } from './notification.types';
import { NotificationService } from './notification.service';
import { NotificationTemplateService } from './notification.template.service';
import { NotificationPreferenceService } from './notification.preference.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('NotificationService', () => {
  const buildNotification = jest.fn();
  const getEffectiveChannels = jest.fn();
  const send = jest.fn();
  const getQueue = jest.fn();
  const prisma = {} as PrismaService;
  const templates = {
    buildNotification,
  } as unknown as NotificationTemplateService;
  const preferences = {
    getEffectiveChannels,
  } as unknown as NotificationPreferenceService;
  const handlers = [{ channel: NotificationChannel.EMAIL, send }] as never;
  const queue = { getQueue } as unknown as QueueService;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    buildNotification.mockReturnValue({
      title: 'Order created',
      message: 'Your order was created',
      channels: [NotificationChannel.EMAIL],
    });
    getEffectiveChannels.mockReturnValue([NotificationChannel.EMAIL]);
    send.mockResolvedValue(undefined);
    service = new NotificationService(
      prisma,
      templates,
      preferences,
      handlers,
      queue,
    );
  });

  it('builds a tenant-scoped dispatch payload and delivers through matching handlers', async () => {
    await service.sendNotification({
      type: NotificationType.ORDER_CREATED,
      tenantId: 'tenant-a',
      userId: 'user-a',
      data: {},
    });

    expect(send).toHaveBeenCalledWith({
      recipientId: 'user-a',
      tenantId: 'tenant-a',
      notification: {
        type: NotificationType.ORDER_CREATED,
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
        tenantId: 'tenant-a',
      }),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates delivery failure and does not hide a failed notification', async () => {
    send.mockRejectedValue(new Error('email provider unavailable'));

    await expect(
      service.sendNotification({
        type: NotificationType.ORDER_CREATED,
        tenantId: 'tenant-a',
      }),
    ).rejects.toThrow('email provider unavailable');
  });
});
