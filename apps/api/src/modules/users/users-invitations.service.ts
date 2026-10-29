import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService as DatabaseService } from '../../core/database/prisma.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { requestContext } from '../../core/request-context/request-context';
import { PERMISSIONS } from '../rbac/permissions';
import { TenantRolePolicyService } from '../rbac/services/tenant-role-policy.service';
import type { CreateUserInvitationDto } from './dto/create-user-invitation.dto';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersInvitationsService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly rolePolicy: TenantRolePolicyService,
  ) {}

  async create(
    tenantId: string,
    invitedByUserId: string,
    input: CreateUserInvitationDto,
  ) {
    const email = input.email.trim().toLowerCase();
    const roleIds = [...new Set(input.roleIds)];
    const outletIds = [...new Set(input.outletIds ?? [])];

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('An account already exists for this email');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

    const invitation = await this.prisma.$transaction(async (transaction) => {
      const roles = await transaction.role.findMany({
        where: { id: { in: roleIds }, tenantId },
        select: { id: true },
      });
      if (roles.length !== roleIds.length) {
        throw new NotFoundException('One or more roles not found');
      }

      await this.rolePolicy.assertCanAssignRoles(
        tenantId,
        invitedByUserId,
        roleIds,
        transaction,
      );

      if (outletIds.length) {
        await this.rolePolicy.assertCanGrantPermissions(
          tenantId,
          invitedByUserId,
          [PERMISSIONS.USER_OUTLET_MANAGE],
          transaction,
        );
        const outlets = await transaction.outlet.findMany({
          where: {
            id: { in: outletIds },
            tenantId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (outlets.length !== outletIds.length) {
          throw new NotFoundException('One or more outlets not found');
        }
      }

      const now = new Date();
      await transaction.userInvitation.updateMany({
        where: {
          tenantId,
          email: { equals: email, mode: 'insensitive' },
          revokedAt: null,
          acceptedAt: null,
        },
        data: { revokedAt: now },
      });

      return transaction.userInvitation.create({
        data: {
          email,
          tokenHash,
          expiresAt,
          Tenant: { connect: { id: tenantId } },
          InvitedBy: { connect: { id: invitedByUserId } },
          Roles: {
            create: roleIds.map((roleId) => ({
              Role: { connect: { id: roleId } },
              Tenant: { connect: { id: tenantId } },
            })),
          },
          Outlets: {
            create: outletIds.map((outletId) => ({
              Outlet: { connect: { id: outletId } },
              Tenant: { connect: { id: tenantId } },
            })),
          },
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
          expiresAt: true,
          Roles: { select: { Role: { select: { id: true, name: true } } } },
          Outlets: { select: { Outlet: { select: { id: true, name: true } } } },
        },
      });
    });

    const setupUrl = new URL(
      '/register',
      this.config.getOrThrow<string>('WEB_BASE_URL'),
    );
    setupUrl.searchParams.set('token', token);

    try {
      await this.email.sendUserInvitation(email, setupUrl.toString());
    } catch {
      const revoked = await this.prisma.userInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new InternalServerErrorException(
          'Invitation delivery failed and its token could not be revoked',
        );
      }
      throw new InternalServerErrorException(
        'Invitation email could not be delivered; the invitation was canceled',
      );
    }

    return {
      ...this.toSafeInvitation(invitation),
      status: 'PENDING' as const,
    };
  }

  async findPending(tenantId: string, page = 1, limit = 20) {
    const where = {
      tenantId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };
    const [rows, total] = await Promise.all([
      this.prisma.userInvitation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          email: true,
          createdAt: true,
          expiresAt: true,
          Roles: { select: { Role: { select: { id: true, name: true } } } },
          Outlets: { select: { Outlet: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.userInvitation.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...this.toSafeInvitation(row),
        status: 'PENDING' as const,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async revoke(tenantId: string, invitationId: string) {
    const result = await this.prisma.userInvitation.updateMany({
      where: {
        id: invitationId,
        tenantId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Invitation not found');
    }
    return { id: invitationId, revoked: true };
  }

  async accept(token: string, password: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds the supported length');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    requestContext.set({ allowPreAuthInvitationLookup: true });
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: { Roles: true, Outlets: true },
    });
    requestContext.set({ allowPreAuthInvitationLookup: false });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= now
    ) {
      throw new UnauthorizedException('Invitation is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    requestContext.set({ tenantId: invitation.tenantId });
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.userInvitation.updateMany({
          where: {
            id: invitation.id,
            tenantId: invitation.tenantId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });
        if (claimed.count !== 1) {
          throw new UnauthorizedException('Invitation is invalid or expired');
        }

        const existingUser = await transaction.user.findFirst({
          where: {
            email: { equals: invitation.email, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException(
            'An account already exists for this email',
          );
        }

        const user = await transaction.user.create({
          data: {
            email: invitation.email,
            password: passwordHash,
            tenantId: invitation.tenantId,
            isActive: true,
          },
          select: { id: true, email: true, tenantId: true },
        });

        if (invitation.Roles.length) {
          await transaction.userRole.createMany({
            data: invitation.Roles.map(({ roleId, tenantId }) => ({
              userId: user.id,
              roleId,
              tenantId,
            })),
          });
        }
        if (invitation.Outlets.length) {
          await transaction.userOutlet.createMany({
            data: invitation.Outlets.map(({ outletId, tenantId }) => ({
              userId: user.id,
              outletId,
              tenantId,
            })),
          });
        }

        return { userId: user.id, email: user.email };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account already exists for this email');
      }
      throw error;
    }
  }

  private toSafeInvitation(invitation: {
    id: string;
    email: string;
    createdAt: Date;
    expiresAt: Date;
    Roles: { Role: { id: string; name: string } }[];
    Outlets: { Outlet: { id: string; name: string } }[];
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      roles: invitation.Roles.map(({ Role }) => Role),
      outlets: invitation.Outlets.map(({ Outlet }) => Outlet),
    };
  }
}
