import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { TenantRolePolicyService } from './tenant-role-policy.service';
import { PERMISSIONS } from '../permissions';

@Injectable()
export class UserRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolePolicy: TenantRolePolicyService,
  ) {}

  async getUserRoles(tenantId: string, userId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { tenantId, userId, deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      roleIds: userRoles.map((ur) => ur.roleId),
      roles: userRoles.map((ur) => ur.role),
    };
  }

  async setUserRoles(
    tenantId: string,
    actorUserId: string,
    userId: string,
    roleIds: string[],
  ) {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (!uniqueRoleIds.length) {
      throw new ConflictException(
        'An active user must retain at least one role',
      );
    }

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
        const user = await transaction.user.findFirst({
          where: { id: userId, tenantId, deletedAt: null },
          select: { id: true, isActive: true },
        });
        if (!user) throw new NotFoundException('User not found');

        await this.rolePolicy.assertCanAssignRoles(
          tenantId,
          actorUserId,
          uniqueRoleIds,
          transaction,
        );

        await transaction.userRole.updateMany({
          where: {
            tenantId,
            userId,
            deletedAt: null,
            roleId: { notIn: uniqueRoleIds },
          },
          data: { deletedAt: new Date() },
        });

        for (const roleId of uniqueRoleIds) {
          const existing = await transaction.userRole.findUnique({
            where: { userId_roleId: { userId, roleId } },
            select: { id: true, tenantId: true },
          });
          if (existing) {
            if (existing.tenantId !== tenantId) {
              throw new NotFoundException('One or more roles not found');
            }
            await transaction.userRole.updateMany({
              where: { id: existing.id, tenantId },
              data: { deletedAt: null },
            });
          } else {
            await transaction.userRole.create({
              data: { tenantId, userId, roleId },
            });
          }
        }

        const activeAdmins = await transaction.user.count({
          where: {
            tenantId,
            deletedAt: null,
            isActive: true,
            UserRole: {
              some: {
                tenantId,
                deletedAt: null,
                role: {
                  RolePermission: {
                    some: {
                      Permission: {
                        code: {
                          in: [
                            PERMISSIONS.USER_MANAGE,
                            PERMISSIONS.USER_ROLE_MANAGE,
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (activeAdmins === 0) {
          throw new ConflictException(
            'At least one active user administrator must remain assigned',
          );
        }
      },
      { isolationLevel: 'Serializable' },
    );

    return this.getUserRoles(tenantId, userId);
  }
}
