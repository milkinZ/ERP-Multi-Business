import {
    CanActivate,
    ExecutionContext,
    Injectable,
} from '@nestjs/common'

import { Reflector } from '@nestjs/core'

import {
    PERMISSIONS_KEY,
} from '../../common/decorator/permissions.decorator'

@Injectable()
export class PermissionGuard
    implements CanActivate {
    constructor(
        private reflector: Reflector,
    ) { }

    canActivate(
        context: ExecutionContext,
    ): boolean {
        const requiredPermissions =
            this.reflector.getAllAndOverride<
                string[]
            >(
                PERMISSIONS_KEY,
                [
                    context.getHandler(),
                    context.getClass(),
                ],
            )

        if (
            !requiredPermissions ||
            requiredPermissions.length === 0
        ) {
            return true
        }

        const request =
            context
                .switchToHttp()
                .getRequest()

        const user = request.user

        return requiredPermissions.every(
            (permission) =>
                user.permissions.includes(
                    permission,
                ),
        )
    }
}