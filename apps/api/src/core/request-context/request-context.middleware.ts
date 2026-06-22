import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { requestContext } from './request-context';
import { Request, Response, NextFunction } from 'express';

// type RequestHeaders = Record<string, string | string[] | undefined>;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incomingRequestId =
      typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : Array.isArray(req.headers['x-request-id'])
          ? req.headers['x-request-id'][0]
          : undefined;

    const resolvedRequestId = incomingRequestId ?? randomUUID();

    const incomingCorrelationId =
      typeof req.headers['x-correlation-id'] === 'string'
        ? req.headers['x-correlation-id']
        : Array.isArray(req.headers['x-correlation-id'])
          ? req.headers['x-correlation-id'][0]
          : undefined;

    const resolvedCorrelationId = incomingCorrelationId ?? resolvedRequestId;

    requestContext.run(
      {
        requestId: resolvedRequestId,
        correlationId: resolvedCorrelationId,
      },
      () => {
        res.setHeader('x-request-id', resolvedRequestId);
        res.setHeader('x-correlation-id', resolvedCorrelationId);
        next();
      },
    );
  }
}
