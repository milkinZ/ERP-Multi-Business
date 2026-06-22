import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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

    response.status(status).json({
      success: false,
      message,
      data: {},
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
