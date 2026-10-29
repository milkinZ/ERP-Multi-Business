import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UsersRepository } from './users.repository';
import type { UserResponseDto } from './dto/user-response.dto';
import type { UsersQueryDto } from './dto/users-query.dto';
import { PERMISSIONS } from '../rbac/permissions';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
  ) {}

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  create(data: {
    email: string;
    password: string;
    tenantId: string;
    // roleId: string;
  }) {
    // Assume caller provides already-hashed password (auth service)
    return this.usersRepository.createUser({
      email: data.email,
      passwordHash: data.password,
      tenantId: data.tenantId,
    });
  }

  async getAll(tenantId: string, query: UsersQueryDto) {
    const result = await this.usersRepository.findAllSafe(tenantId, {
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      isActive:
        query.status === undefined ? undefined : query.status === 'ACTIVE',
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return {
      data: result.data.map((user) => this.toResponse(user)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async getById(tenantId: string, userId: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findSafeById(tenantId, userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toResponse(user);
  }

  async setStatus(
    tenantId: string,
    actorUserId: string,
    userId: string,
    isActive: boolean,
  ) {
    if (!isActive && actorUserId === userId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
        const user = await transaction.user.findFirst({
          where: { id: userId, tenantId, deletedAt: null },
          select: { id: true, isActive: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (user.isActive === isActive) return { id: userId, isActive };

        if (!isActive) {
          const otherAdmins = await transaction.user.count({
            where: {
              tenantId,
              deletedAt: null,
              isActive: true,
              id: { not: userId },
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
          if (otherAdmins === 0) {
            throw new ConflictException(
              'The last active user administrator cannot be deactivated',
            );
          }
        }

        await transaction.user.updateMany({
          where: { id: userId, tenantId, deletedAt: null },
          data: { isActive },
        });

        if (!isActive) {
          const revokedAt = new Date();
          await transaction.refreshToken.updateMany({
            where: { userId, tenantId, revokedAt: null },
            data: { revokedAt },
          });
          await transaction.session.updateMany({
            where: { userId, tenantId, deletedAt: null },
            data: { deletedAt: revokedAt },
          });
        }

        return { id: userId, isActive };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private toResponse(
    user: Awaited<ReturnType<UsersRepository['findAllSafe']>>['data'][number],
  ): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles: user.UserRole.map(({ role }) => role),
      outlets: user.UserOutlet.map(({ outlet }) => outlet),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
