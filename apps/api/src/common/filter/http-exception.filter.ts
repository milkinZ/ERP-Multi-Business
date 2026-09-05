import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';
import { ErrorTrackingService } from '../../infrastructure/observability/error-tracking/error-tracking.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorTracking?: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    const request = ctx.getRequest<{ url?: string }>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    if (isHttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object' && 'message' in res) {
        const maybeMessage = (res as { message?: unknown }).message;
        message = Array.isArray(maybeMessage)
          ? maybeMessage.join(', ')
          : typeof maybeMessage === 'string'
            ? maybeMessage
            : message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const reqCtx = requestContext.get();

    // Report unexpected errors to error-tracking (non-blocking)
    if (!(exception instanceof HttpException) && exception instanceof Error) {
      try {
        this.errorTracking?.captureException(exception, {
          tags: {
            requestId: reqCtx.requestId,
            correlationId: reqCtx.correlationId,
            tenantId: reqCtx.tenantId,
            userId: reqCtx.userId,
            outletId: reqCtx.outletId,
          },
        });
      } catch {
        // Ignore - observability must not break business flows.
      }
    }

    response.status(status).json({
      success: false,
      message,
      data: {},
      statusCode: status,
      path: request.url,
      requestId: reqCtx.requestId,
      correlationId: reqCtx.correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
