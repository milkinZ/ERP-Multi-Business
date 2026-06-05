import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    tenantId: string;
    roleId: string;
    outletId?: string | null;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.usersService.create({
      ...data,
      password: hashedPassword,
    });

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = await this.prisma.role.findUnique({
      where: {
        id: user.roleId,
      },

      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    const permissions =
      role?.rolePermissions.map((rp) => rp.permission.code) ?? [];

    const token = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      outletId: user.outletId,
      permissions,
    });

    return {
      accessToken: token,
    };
  }
}
