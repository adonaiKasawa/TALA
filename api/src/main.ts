import 'dotenv/config';
import { createApiApp } from './app.factory.js';
import { ConfigService } from './config/config.service.js';

async function bootstrap() {
  const app = await createApiApp();
  app.enableShutdownHooks();
  const config = app.get(ConfigService).value;
  try {
    await app.listen(config.API_PORT, config.HOST);
  } catch (error) {
    await app.close();
    throw error;
  }
  console.info(`TALA API : http://${config.HOST}:${config.API_PORT}/api/v1`);
}
void bootstrap().catch((error: unknown) => {
  console.error(
    (error as { code?: string })?.code === 'EADDRINUSE'
      ? 'API : port deja utilise. Arreter l’autre instance avant de relancer.'
      : 'API : demarrage impossible. Verifier la configuration et PostgreSQL.',
  );
  process.exitCode = 1;
});
