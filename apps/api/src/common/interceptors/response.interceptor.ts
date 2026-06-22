import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

type StandardResponse<T> = {
  success: true;
  message: string;
  data: T;
};

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept<T>(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        message: 'OK',
        data,
      })),
    );
  }
}
