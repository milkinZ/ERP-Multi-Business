import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UsersRepository } from './users.repository';

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
}
