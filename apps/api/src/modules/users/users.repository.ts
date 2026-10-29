import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { UserAggregate } from './domain/user.aggregate';

export type SafeUserRecord = {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  UserRole: { role: { id: string; name: string } }[];
  UserOutlet: { outlet: { id: string; name: string } }[];
};

export type UsersQueryOptions = {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  sortBy: 'email' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
};

@Injectable()
export class UsersRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    tenantId: string;
  }) {
    const aggregate = UserAggregate.create({
      id: `USR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      email: data.email,
      passwordHash: data.passwordHash,
      tenantId: data.tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const persisted = await this.prisma.user.create({
      data: {
        id: aggregate['id'],
        email: aggregate['email'],
        password: aggregate['passwordHash'],
        tenantId: aggregate['tenantId'],
      },
    });

    return UserAggregate.fromPersistence(persisted);
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findAllSafe(
    tenantId: string,
    options: UsersQueryOptions,
  ): Promise<{ data: SafeUserRecord[]; total: number }> {
    const where = {
      tenantId,
      deletedAt: null,
      ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
      ...(options.search
        ? { email: { contains: options.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        select: {
          id: true,
          email: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          UserRole: {
            where: { tenantId, deletedAt: null },
            select: { role: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
          UserOutlet: {
            where: { tenantId, deletedAt: null },
            select: { outlet: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [
          { [options.sortBy]: options.sortOrder },
          { id: options.sortOrder },
        ],
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  async findSafeById(
    tenantId: string,
    userId: string,
  ): Promise<SafeUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        UserRole: {
          where: { tenantId, deletedAt: null },
          select: { role: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        UserOutlet: {
          where: { tenantId, deletedAt: null },
          select: { outlet: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
