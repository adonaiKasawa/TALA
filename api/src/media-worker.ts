import 'dotenv/config';
import { createMediaWorker } from './videos/media-worker.module.js';
async function bootstrap() {
  const app = await createMediaWorker();
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void app
      .close()
      .then(() => process.exit(0))
      .catch(() => {
        console.error(
          'Worker média : arrêt incomplet, reprise par les baux persistants.',
        );
        process.exit(1);
      });
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  process.on('message', (message) => {
    if (message === 'stop') close();
  });
  process.on('disconnect', close);
  console.info('TALA worker média démarré.');
}
void bootstrap().catch(() => {
  console.error(
    'Worker média : démarrage impossible. Vérifiez la configuration et les services.',
  );
  process.exitCode = 1;
});
