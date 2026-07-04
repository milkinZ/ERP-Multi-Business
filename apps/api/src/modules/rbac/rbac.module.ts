import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { PermissionController } from './controllers/permissions.controller';
import { PermissionsService } from './services/permissions.service';

import { RolesController } from './controllers/roles.controller';
import { RolesService } from './services/roles.service';

import { RolePermissionsController } from './controllers/role-permissions.controller';
import { RolePermissionsService } from './services/role-permissions.service';

import { UserRolesController } from './controllers/user-roles.controller';
import { UserRolesService } from './services/user-roles.service';

import { UserOutletsController } from './controllers/user-outlets.controller';
import { UserOutletsService } from './services/user-outlets.service';

import { RBACPermissionsSeeder } from './seeders/rbac-permissions.seeder';

@Module({
  imports: [PrismaModule],
  controllers: [
    PermissionController,
    RolesController,
    RolePermissionsController,
    UserRolesController,
    UserOutletsController,
  ],
  providers: [
    PermissionsService,
    RolesService,
    RolePermissionsService,
    UserRolesService,
    UserOutletsService,
    RBACPermissionsSeeder,
  ],
  exports: [],
})
export class RBACModule {}
