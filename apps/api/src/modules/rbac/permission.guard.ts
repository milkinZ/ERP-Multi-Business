import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';
import { extractUserPermissions } from '../../common/utils/request-extractors';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<unknown>();

    const permissions = extractUserPermissions(request);

    if (!permissions) {
      return false;
    }

    return requiredPermissions.every((permission) =>
      permissions.includes(permission),
    );
  }
}
