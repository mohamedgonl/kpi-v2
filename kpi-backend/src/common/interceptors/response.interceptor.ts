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
        // If it's already formatted or it's a stream, return as is
        if (res && typeof res === 'object' && ('data' in res || 'error' in res)) {
          return res;
        }

        const responseData = res;
        const metaData = undefined;

        return {
          data: responseData,
          meta: metaData,
          error: null,
        };
      }),
    );
  }
}
