import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'node:crypto';

import { PrismaService } from '../../../core/database/prisma.service';
import { PERMISSIONS } from '../permissions';
import {
  isTenantAssignablePermission,
  TENANT_ASSIGNABLE_PERMISSION_CODES,
} from '../tenant-permissions';
import { TenantRolePolicyService } from './tenant-role-policy.service';

const managerPermissionPrefixes = [
  'product.',
  'order.',
  'inventory.',
  'report.',
  'payment.',
  'analytics.',
  'kitchen.',
  'recipe.',
  'ingredient.',
  'warehouse.',
  'supplier.',
  'stock.',
  'purchase_order.',
];
const outletManagerPermissions: string[] = [
  PERMISSIONS.OUTLET_READ,
  PERMISSIONS.OUTLET_CREATE,
  PERMISSIONS.OUTLET_UPDATE,
];

const defaultSystemRoles = [
  {
    key: 'OWNER',
    name: 'Owner',
    description: 'Full tenant access, including user and role administration.',
    permissionCodes: [...TENANT_ASSIGNABLE_PERMISSION_CODES],
  },
  {
    key: 'MANAGER',
    name: 'Manager',
    description: 'Operational management without user or role administration.',
    permissionCodes: TENANT_ASSIGNABLE_PERMISSION_CODES.filter(
      (code) =>
        managerPermissionPrefixes.some((prefix) => code.startsWith(prefix)) ||
        outletManagerPermissions.includes(code),
    ),
  },
  {
    key: 'STAFF',
    name: 'Staff',
    description: 'Basic product, sales, payment, kitchen, and outlet access.',
    permissionCodes: [
      PERMISSIONS.PRODUCT_READ,
      PERMISSIONS.ORDER_CREATE,
      PERMISSIONS.ORDER_READ,
      PERMISSIONS.PAYMENT_CREATE,
      PERMISSIONS.PAYMENT_READ,
      PERMISSIONS.KITCHEN_READ,
      PERMISSIONS.OUTLET_READ,
    ],
  },
] as const;

type RoleListOptions = {
  page: number;
  limit: number;
  search?: string;
  sortBy: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolePolicy: TenantRolePolicyService,
  ) {}

  async getAll(tenantId: string, options: RoleListOptions) {
    await this.ensureDefaultRoles(tenantId);
    const where: Prisma.RoleWhereInput = {
      tenantId,
      ...(options.search
        ? { name: { contains: options.search, mode: 'insensitive' } }
        : {}),
    };
    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        orderBy: [{ [options.sortBy]: options.sortOrder }, { id: 'asc' }],
        include: {
          _count: {
            select: {
              UserRole: { where: { deletedAt: null } },
              RolePermission: true,
            },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      data: roles.map((role) => this.toResponse(role)),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }

  async getById(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
      include: {
        _count: {
          select: {
            UserRole: { where: { deletedAt: null } },
            RolePermission: true,
          },
        },
      },
    });

    if (!role) throw new NotFoundException('Role not found');
    return this.toResponse(role);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    data: {
      name: string;
      description?: string;
      permissionCodes?: string[];
    },
  ) {
    const permissionCodes = await this.validatePermissionCodes(
      data.permissionCodes,
    );
    await this.rolePolicy.assertCanGrantPermissions(
      tenantId,
      actorUserId,
      permissionCodes,
    );

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        RolePermission: permissionCodes.length
          ? {
              create: permissionCodes.map((code) => ({
                id: crypto.randomUUID(),
                Permission: { connect: { code } },
              })),
            }
          : undefined,
      },
      include: {
        _count: {
          select: {
            UserRole: { where: { deletedAt: null } },
            RolePermission: true,
          },
        },
      },
    });
    return this.toResponse(role);
  }

  async update(
    tenantId: string,
    actorUserId: string,
    roleId: string,
    data: {
      name: string;
      description?: string;
      permissionCodes?: string[];
    },
  ) {
    const role = await this.getRawById(tenantId, roleId);
    this.assertEditable(role.isSystem);
    const permissionCodes =
      data.permissionCodes === undefined
        ? undefined
        : await this.validatePermissionCodes(data.permissionCodes);

    if (permissionCodes) {
      await this.rolePolicy.assertCanGrantPermissions(
        tenantId,
        actorUserId,
        permissionCodes,
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.role.updateMany({
        where: { id: role.id, tenantId, isSystem: false },
        data: {
          name: data.name.trim(),
          ...(data.description === undefined
            ? {}
            : { description: data.description.trim() || null }),
        },
      });

      if (permissionCodes) {
        await transaction.rolePermission.deleteMany({
          where: { roleId: role.id },
        });
        if (permissionCodes.length) {
          const permissions = await transaction.permission.findMany({
            where: { code: { in: permissionCodes } },
            select: { id: true },
          });
          await transaction.rolePermission.createMany({
            data: permissions.map((permission) => ({
              id: crypto.randomUUID(),
              roleId: role.id,
              permissionId: permission.id,
            })),
          });
        }
      }
    });

    return this.getById(tenantId, roleId);
  }

  private async validatePermissionCodes(codes?: string[]): Promise<string[]> {
    const uniqueCodes = [...new Set(codes ?? [])];
    if (!uniqueCodes.length) return [];

    if (uniqueCodes.some((code) => !isTenantAssignablePermission(code))) {
      throw new ForbiddenException(
        'Permission code is not assignable to tenant roles',
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true },
    });
    const knownCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    const unknownCode = uniqueCodes.find((code) => !knownCodes.has(code));
    if (unknownCode) {
      throw new NotFoundException(
        `Permission not found for code: ${unknownCode}`,
      );
    }
    return uniqueCodes;
  }

  async remove(tenantId: string, roleId: string) {
    const role = await this.getRawById(tenantId, roleId);
    this.assertEditable(role.isSystem);

    const references = await this.prisma.role.findFirst({
      where: {
        id: role.id,
        tenantId,
        OR: [
          { UserRole: { some: { deletedAt: null } } },
          {
            UserInvitationRole: {
              some: {
                Invitation: {
                  acceptedAt: null,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (references) {
      throw new ConflictException(
        'This role cannot be deleted while it is assigned or invited',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.rolePermission.deleteMany({
        where: { roleId: role.id },
      });
      await transaction.role.deleteMany({
        where: { id: role.id, tenantId, isSystem: false },
      });
    });

    return { id: role.id, deleted: true };
  }

  private async getRawById(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private assertEditable(isSystem: boolean) {
    if (isSystem) {
      throw new ForbiddenException('System roles cannot be changed or deleted');
    }
  }

  private async ensureDefaultRoles(tenantId: string): Promise<void> {
    const permissionCodes = [
      ...new Set(defaultSystemRoles.flatMap((role) => role.permissionCodes)),
    ];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true },
    });
    const knownCodes = new Set(
      permissions.map((permission) => permission.code),
    );
    const missingCode = permissionCodes.find((code) => !knownCodes.has(code));
    if (missingCode) {
      throw new InternalServerErrorException(
        `Required system role permission is not seeded: ${missingCode}`,
      );
    }

    for (const role of defaultSystemRoles) {
      const rolePermissions = role.permissionCodes.map((code) => {
        const permission = permissions.find((item) => item.code === code);
        if (!permission) {
          throw new InternalServerErrorException(
            `Required system role permission is not seeded: ${code}`,
          );
        }
        return {
          id: crypto.randomUUID(),
          Permission: { connect: { id: permission.id } },
        };
      });

      await this.prisma.role.upsert({
        where: {
          tenantId_systemKey: { tenantId, systemKey: role.key },
        },
        create: {
          tenantId,
          systemKey: role.key,
          isSystem: true,
          name: role.name,
          description: role.description,
          RolePermission: { create: rolePermissions },
        },
        update: {},
      });
    }
  }

  private toResponse<
    T extends {
      id: string;
      name: string;
      description: string | null;
      isSystem: boolean;
      systemKey: string | null;
      tenantId: string;
      createdAt: Date;
      updatedAt: Date;
      _count: { UserRole: number; RolePermission: number };
    },
  >(role: T) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      systemKey: role.systemKey,
      tenantId: role.tenantId,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      assignedUserCount: role._count.UserRole,
      permissionCount: role._count.RolePermission,
    };
  }
}
