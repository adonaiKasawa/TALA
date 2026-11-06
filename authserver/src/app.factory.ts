import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Pool } from 'pg';
import { AppModule } from './app.module.js';
import { Database } from './database/database.service.js';
import { ConfigService } from './config/config.service.js';
import { MailService } from './mail/mail.service.js';
import { CleanupService } from './database/cleanup.service.js';
import { RateLimitService } from './security/rate-limit.service.js';
import { OidcService } from './oidc/oidc.service.js';
import { SafeErrors } from './security/http-security.js';
import { openApi } from './documentation/openapi.js';
import { BrowserResponses } from './interactions/browser-responses.js';

export async function createAuthApp() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  const db = app.get(Database);
  await db.$connect();
  const oidc = app.get(OidcService);
  await oidc.initialize();
  const config = app.get(ConfigService).value;
  const limits = app.get(RateLimitService);
  const server = app.getHttpAdapter().getInstance() as express.Express;
  if (config.AUTH_TRUST_PROXY)
    server.set('trust proxy', config.AUTH_TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'upgrade-insecure-requests': config.secure ? [] : null,
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin' },
    }),
  );
  app.use(cookieParser(config.cookieKeys));
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
  const locks = new Pool({
    connectionString: config.AUTH_DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5000,
  });
  const protocol =
    /^\/(?:\.well-known(?:\/|$)|auth(?:\/|$)|token(?:\/|$)|jwks(?:\/|$)|me(?:\/|$)|session(?:\/|$)|request(?:\/|$)|device(?:\/|$)|backchannel(?:\/|$))/;
  const callback = oidc.provider.callback();
  app.use(
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      try {
        if (!req.path.startsWith('/health') && req.path !== '/identity.css')
          await limits.check(`http:${req.ip}`, 1000, 60);
        if (
          req.method === 'POST' &&
          /^\/(?:account|interaction)/.test(req.path)
        )
          await limits.check(`post:${req.ip}`, 100, 900);
        if (!protocol.test(req.path)) return next();
        if (req.method === 'POST' && req.path === '/token') {
          // Separate pool: queued locks must not exhaust the provider's persistence pool.
          // Conservative global serialization until per-grant locking is load-tested.
          const connection = await locks.connect();
          try {
            await connection.query('SELECT pg_advisory_lock(74180326)');
            await callback(req, res);
          } finally {
            await connection
              .query('SELECT pg_advisory_unlock(74180326)')
              .catch(() => {});
            connection.release();
          }
        } else {
          await callback(req, res);
        }
      } catch (error) {
        if (!res.headersSent)
          res
            .status(
              (error as { getStatus?: () => number }).getStatus?.() ?? 503,
            )
            .json({ message: 'Requête indisponible ou limite atteinte.' });
      }
    },
  );
  app.use(express.json({ limit: '32kb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.useGlobalFilters(new SafeErrors());
  app.useGlobalInterceptors(new BrowserResponses());
  SwaggerModule.setup('docs', app, openApi(config.issuer), {
    customSiteTitle: 'TALA AuthServer — Swagger',
    swaggerOptions: {
      persistAuthorization: false,
      validatorUrl: null,
    },
  });
  const mail = setInterval(() => {
    void app
      .get(MailService)
      .mailTick()
      .catch(() => {});
  }, 10000);
  mail.unref();
  const cleanup = setInterval(() => {
    void app
      .get(CleanupService)
      .cleanup()
      .catch(() => {});
  }, 60000);
  cleanup.unref();
  const close = app.close.bind(app);
  app.close = async () => {
    clearInterval(mail);
    clearInterval(cleanup);
    await locks.end();
    await close();
  };
  await app.init();
  return app;
}
