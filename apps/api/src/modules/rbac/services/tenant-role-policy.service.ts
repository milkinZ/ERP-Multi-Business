import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';

type RolePolicyClient = Pick<Prisma.TransactionClient, 'userRole' | 'role'>;

@Injectable()
export class TenantRolePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanGrantPermissions(
    tenantId: string,
    actorUserId: string,
    permissionCodes: string[],
    client: RolePolicyClient = this.prisma,
  ): Promise<void> {
    if (!permissionCodes.length) return;
    const userRoles = await client.userRole.findMany({
      where: { userId: actorUserId, tenantId, deletedAt: null },
      select: {
        role: {
          select: {
            RolePermission: {
              select: { Permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    const actorPermissions = new Set(
      userRoles.flatMap((userRole) =>
        userRole.role.RolePermission.map(({ Permission }) => Permission.code),
      ),
    );
    const forbiddenCode = permissionCodes.find(
      (code) => !actorPermissions.has(code),
    );
    if (forbiddenCode) {
      throw new ForbiddenException(
        'You cannot grant permissions you do not have',
      );
    }
  }

  async assertCanAssignRoles(
    tenantId: string,
    actorUserId: string,
    roleIds: string[],
    client: RolePolicyClient = this.prisma,
  ): Promise<void> {
    if (!roleIds.length) return;
    const roles = await client.role.findMany({
      where: { id: { in: roleIds }, tenantId },
      select: {
        id: true,
        RolePermission: {
          select: { Permission: { select: { code: true } } },
        },
      },
    });
    if (roles.length !== roleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }
    const permissionCodes = [
      ...new Set(
        roles.flatMap((role) =>
          role.RolePermission.map(({ Permission }) => Permission.code),
        ),
      ),
    ];
    await this.assertCanGrantPermissions(
      tenantId,
      actorUserId,
      permissionCodes,
      client,
    );
  }
}
