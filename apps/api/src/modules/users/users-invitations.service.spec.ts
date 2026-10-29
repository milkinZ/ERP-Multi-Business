import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { EmailService } from '../../infrastructure/email/email.service';
import { UsersInvitationsService } from './users-invitations.service';

type InvitationCreateInput = {
  data: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    Roles: {
      create: {
        Role: { connect: { id: string } };
        Tenant: { connect: { id: string } };
      }[];
    };
    Outlets: {
      create: {
        Outlet: { connect: { id: string } };
        Tenant: { connect: { id: string } };
      }[];
    };
  };
};

describe('UsersInvitationsService', () => {
  const userFindFirst = jest.fn();
  const userCreate = jest.fn();
  const roleFindMany = jest.fn();
  const outletFindMany = jest.fn();
  const invitationUpdateMany = jest.fn();
  const invitationFindUnique = jest.fn();
  const userRoleCreateMany = jest.fn();
  const userOutletCreateMany = jest.fn();
  const invitationCreate = jest.fn((input: InvitationCreateInput) => ({
    id: 'invitation-a',
    email: input.data.email,
    createdAt: new Date('2026-10-26T00:00:00.000Z'),
    expiresAt: input.data.expiresAt,
    Roles: [{ Role: { id: 'role-owner', name: 'Owner' } }],
    Outlets: [{ Outlet: { id: 'outlet-main', name: 'Main outlet' } }],
  }));
  const transactionClient = {
    user: { findFirst: userFindFirst, create: userCreate },
    role: { findMany: roleFindMany },
    outlet: { findMany: outletFindMany },
    userInvitation: {
      findUnique: invitationFindUnique,
      updateMany: invitationUpdateMany,
      create: invitationCreate,
    },
    userRole: { createMany: userRoleCreateMany },
    userOutlet: { createMany: userOutletCreateMany },
  };
  const transaction = jest.fn(
    (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const prisma = {
    user: { findFirst: userFindFirst },
    userInvitation: {
      findUnique: invitationFindUnique,
      updateMany: invitationUpdateMany,
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3001'),
  } as unknown as ConfigService;
  const sendUserInvitation = jest.fn(
    (recipient: string, setupUrl: string): Promise<void> => {
      if (!recipient || !setupUrl) {
        return Promise.reject(
          new Error('Invitation email parameters required'),
        );
      }
      return Promise.resolve();
    },
  );
  const email = { sendUserInvitation } as unknown as EmailService;
  const rolePolicy = {
    assertCanAssignRoles: jest.fn().mockResolvedValue(undefined),
    assertCanGrantPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const service = new UsersInvitationsService(
    prisma,
    config,
    email,
    rolePolicy as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    userFindFirst.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      id: 'user-new',
      email: 'person@example.test',
      tenantId: 'tenant-a',
    });
    roleFindMany.mockResolvedValue([{ id: 'role-owner' }]);
    outletFindMany.mockResolvedValue([{ id: 'outlet-main' }]);
    invitationUpdateMany.mockResolvedValue({ count: 0 });
    invitationFindUnique.mockResolvedValue(null);
    userRoleCreateMany.mockResolvedValue({ count: 1 });
    userOutletCreateMany.mockResolvedValue({ count: 1 });
    sendUserInvitation.mockResolvedValue(undefined);
  });

  it('sends a one-time link while persisting only a hash and safe invitation data', async () => {
    const result = await service.create('tenant-a', 'actor-a', {
      email: '  PERSON@EXAMPLE.TEST ',
      roleIds: ['role-owner', 'role-owner'],
      outletIds: ['outlet-main'],
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'invitation-a',
        email: 'person@example.test',
        status: 'PENDING',
        roles: [{ id: 'role-owner', name: 'Owner' }],
        outlets: [{ id: 'outlet-main', name: 'Main outlet' }],
      }),
    );
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('tokenHash');
    const createCall = invitationCreate.mock.calls[0]?.[0];
    if (!createCall) throw new Error('Invitation record was not created');
    expect(createCall.data.email).toBe('person@example.test');
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.Roles.create).toEqual([
      {
        Role: { connect: { id: 'role-owner' } },
        Tenant: { connect: { id: 'tenant-a' } },
      },
    ]);
    expect(sendUserInvitation).toHaveBeenCalledTimes(1);
    const invitationCall = sendUserInvitation.mock.calls[0];
    if (!invitationCall) throw new Error('Invitation email was not sent');
    const [recipient, setupLink] = invitationCall;
    expect(recipient).toBe('person@example.test');
    const url = new URL(setupLink);
    expect(url.origin).toBe('http://localhost:3001');
    expect(url.pathname).toBe('/register');
    expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createCall.data.tokenHash).not.toBe(url.searchParams.get('token'));
    expect(rolePolicy.assertCanAssignRoles).toHaveBeenCalledWith(
      'tenant-a',
      'actor-a',
      ['role-owner'],
      transactionClient,
    );
    expect(rolePolicy.assertCanGrantPermissions).toHaveBeenCalledWith(
      'tenant-a',
      'actor-a',
      ['rbac.user.outlet.manage'],
      transactionClient,
    );
  });

  it('accepts an invitation with tenant context for every transactional write', async () => {
    invitationFindUnique.mockImplementation(() => {
      expect(requestContext.get().allowPreAuthInvitationLookup).toBe(true);
      return {
        id: 'invitation-a',
        email: 'person@example.test',
        tenantId: 'tenant-a',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        Roles: [{ roleId: 'role-owner', tenantId: 'tenant-a' }],
        Outlets: [{ outletId: 'outlet-main', tenantId: 'tenant-a' }],
      };
    });
    invitationUpdateMany.mockImplementation(() => {
      expect(requestContext.get()).toEqual(
        expect.objectContaining({
          allowPreAuthInvitationLookup: false,
          tenantId: 'tenant-a',
        }),
      );
      return { count: 1 };
    });
    userFindFirst.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return null;
    });
    userCreate.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return {
        id: 'user-new',
        email: 'person@example.test',
        tenantId: 'tenant-a',
      };
    });
    userRoleCreateMany.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return { count: 1 };
    });
    userOutletCreateMany.mockImplementation(() => {
      expect(requestContext.get().tenantId).toBe('tenant-a');
      return { count: 1 };
    });

    const result = await requestContext.run({ requestId: 'request-a' }, () =>
      service.accept('one-time-token', 'ValidPassword-12345'),
    );

    expect(result).toEqual({
      userId: 'user-new',
      email: 'person@example.test',
    });
    expect(userRoleCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-new', roleId: 'role-owner', tenantId: 'tenant-a' },
      ],
    });
    expect(userOutletCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-new', outletId: 'outlet-main', tenantId: 'tenant-a' },
      ],
    });
  });

  it('rejects invitations for an email that already has an account', async () => {
    userFindFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.create('tenant-a', 'actor-a', {
        email: 'person@example.test',
        roleIds: ['role-owner'],
      }),
    ).rejects.toThrow(
      new ConflictException('An account already exists for this email'),
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(sendUserInvitation).not.toHaveBeenCalled();
  });

  it('revokes an invitation and reports failure when email delivery fails', async () => {
    sendUserInvitation.mockRejectedValue(new Error('SMTP unavailable'));
    invitationUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.create('tenant-a', 'actor-a', {
        email: 'person@example.test',
        roleIds: ['role-owner'],
      }),
    ).rejects.toThrow(
      new InternalServerErrorException(
        'Invitation email could not be delivered; the invitation was canceled',
      ),
    );

    expect(invitationUpdateMany).toHaveBeenCalledTimes(2);
  });
});
