import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ConfigService } from './config/config.service.js';
import { SafeErrors } from './security/safe-errors.filter.js';
import { apiDocument } from './documentation/openapi.js';

export async function createApiApp() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  const config = app.get(ConfigService).value;
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests':
            config.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
  );
  app.use(
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.use(
    '/api/v1/videos/mux/webhook',
    express.raw({ type: 'application/json', limit: '512kb' }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.useGlobalFilters(new SafeErrors());
  SwaggerModule.setup('docs', app, apiDocument(), {
    customSiteTitle: 'TALA API — Swagger',
    swaggerOptions: { persistAuthorization: false, validatorUrl: null },
  });
  await app.init();
  return app;
}
