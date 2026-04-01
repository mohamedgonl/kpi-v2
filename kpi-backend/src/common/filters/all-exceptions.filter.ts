import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as Error).message || 'Internal Server Error' };

    // Prevent crashing on Vercel by ensuring 200/400/500 responses are well-formed JSON
    response.status(status).json({
      data: null,
      meta: null,
      error: {
        statusCode: status,
        message: typeof message === 'string' ? message : (message as any).message || 'Server Error',
        details: typeof message === 'object' ? message : null,
      },
    });
  }
}
