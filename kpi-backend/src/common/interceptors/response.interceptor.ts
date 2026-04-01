import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((res: unknown) => {
        const responseData = typeof res === 'object' && res !== null && 'data' in res ? (res as any).data : res;
        const metaData = typeof res === 'object' && res !== null && 'meta' in res ? (res as any).meta : undefined;

        return {
          data: responseData,
          meta: metaData,
          error: null,
        };
      }),
      catchError((err) => {
        const status =
          err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

        const errorResponse = {
          data: null,
          meta: null,
          error: {
            statusCode: status,
            message: err.message || 'Internal Server Error',
            details: err.response?.message || err.response || null,
          },
        };

        return throwError(() => new HttpException(errorResponse, status));
      }),
    );
  }
}
