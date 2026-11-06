import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      res.status(400).json({
        message: 'Verifier les champs du formulaire.',
        errors: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    const parserError = error as { type?: string };
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserError?.type === 'entity.too.large'
          ? 413
          : parserError?.type === 'entity.parse.failed'
            ? 400
            : 500;
    if (status === 401)
      res.setHeader('WWW-Authenticate', 'Bearer realm="tala-api"');
    if (status === 429) res.setHeader('Retry-After', '60');
    res.status(status).json({
      message:
        status >= 500
          ? 'Service temporairement indisponible.'
          : error instanceof HttpException
            ? error.message
            : 'Requete refusee.',
    });
  }
}
