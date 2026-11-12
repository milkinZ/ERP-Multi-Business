import { PrismaService } from '../../core/database/prisma.service';
import { NotificationRecipientService } from './notification-recipient.service';

describe('NotificationRecipientService', () => {
  const userOutletFindMany = jest.fn();
  const userFindMany = jest.fn();
  const service = new NotificationRecipientService({
    userOutlet: { findMany: userOutletFindMany },
    user: { findMany: userFindMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires an active outlet assignment and the required permission', async () => {
    userOutletFindMany.mockResolvedValue([
      { userId: 'user-a' },
      { userId: 'user-b' },
    ]);

    await expect(
      service.findForOutlet('tenant-a', 'outlet-a', 'order.read'),
    ).resolves.toEqual(['user-a', 'user-b']);
    expect(userOutletFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
        deletedAt: null,
        outlet: { tenantId: 'tenant-a', deletedAt: null },
        user: {
          tenantId: 'tenant-a',
          isActive: true,
          deletedAt: null,
          UserRole: {
            some: {
              tenantId: 'tenant-a',
              deletedAt: null,
              role: {
                tenantId: 'tenant-a',
                RolePermission: {
                  some: { Permission: { code: 'order.read' } },
                },
              },
            },
          },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('requires explicit tenant-wide authorization and permission', async () => {
    userFindMany.mockResolvedValue([{ id: 'user-a' }]);

    await expect(
      service.findForTenant('tenant-a', 'invoice.read'),
    ).resolves.toEqual(['user-a']);
    expect(userFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        isActive: true,
        deletedAt: null,
        tenantWideNotificationAccess: true,
        UserRole: {
          some: {
            tenantId: 'tenant-a',
            deletedAt: null,
            role: {
              tenantId: 'tenant-a',
              RolePermission: {
                some: { Permission: { code: 'invoice.read' } },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    expect(userOutletFindMany).not.toHaveBeenCalled();
  });
});
