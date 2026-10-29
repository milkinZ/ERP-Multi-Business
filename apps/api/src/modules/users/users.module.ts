import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersInvitationsService } from './users-invitations.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { RBACModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RBACModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UsersInvitationsService,
    EmailService,
  ],
  exports: [UsersService, UsersRepository, UsersInvitationsService],
})
export class UsersModule {}
