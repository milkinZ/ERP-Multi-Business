import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UsersRepository } from './users.repository';
import type { UserResponseDto } from './dto/user-response.dto';

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

  async getAll(tenantId: string): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.findAllSafe(tenantId);
    return users.map((user) => this.toResponse(user));
  }

  async getById(tenantId: string, userId: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findSafeById(tenantId, userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toResponse(user);
  }

  private toResponse(
    user: Awaited<ReturnType<UsersRepository['findAllSafe']>>[number],
  ): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      roles: user.UserRole.map(({ role }) => role),
      outlets: user.UserOutlet.map(({ outlet }) => outlet),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
