import 'dotenv/config';
import { createAuthApp } from './app.factory';

async function bootstrap() {
  const app = await createAuthApp();
  app.enableShutdownHooks();
  try {
    await app.listen(
      Number(process.env.AUTH_PORT ?? 4000),
      process.env.HOST ?? '127.0.0.1',
    );
  } catch (error) {
    await app.close();
    throw error;
  }
  console.info(
    `TALA AuthServer : ${process.env.OIDC_ISSUER ?? 'http://localhost:4000'}`,
  );
}
void bootstrap().catch((error: unknown) => {
  if ((error as { code?: string })?.code === 'EADDRINUSE') {
    console.error(
      `AuthServer : le port ${process.env.AUTH_PORT ?? 4000} est deja utilise. Arreter l'autre instance avant de relancer.`,
    );
    process.exitCode = 1;
    return;
  }
  console.error(
    'AuthServer : demarrage impossible. Verifier la configuration et PostgreSQL.',
  );
  process.exitCode = 1;
});
