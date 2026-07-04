import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { UserAggregate } from './domain/user.aggregate';

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
    return this.prisma.user.findUnique({ where: { email } });
  }
}
