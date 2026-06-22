import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class ApiKeyAuthMiddleware implements NestMiddleware {
  use(_req: any, _res: any, next: () => void) {
    next();
  }
}
