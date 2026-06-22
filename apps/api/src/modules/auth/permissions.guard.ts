import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';

type UserWithPermissions = {
  permissions: string[];
};

function isUserWithPermissions(value: unknown): value is UserWithPermissions {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  const perms = obj['permissions'];

  if (!Array.isArray(perms)) return false;
  for (const p of perms) {
    if (typeof p !== 'string') return false;
  }

  return true;
}

function extractUserFromContext(context: ExecutionContext): unknown {
  const requestUnknown: unknown = context.switchToHttp().getRequest();
  if (!requestUnknown || typeof requestUnknown !== 'object') return undefined;

  const req = requestUnknown as Record<string, unknown>;
  return req['user'];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const userUnknown = extractUserFromContext(context);

    if (!isUserWithPermissions(userUnknown)) {
      throw new ForbiddenException('No permissions found');
    }

    return requiredPermissions.every((permission) =>
      userUnknown.permissions.includes(permission),
    );
  }
}
