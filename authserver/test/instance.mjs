import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAuthApp } = require('../dist/app.factory.js');
const { RateLimitService } = require('../dist/security/rate-limit.service.js');
const app = await createAuthApp();
await app.listen(0, '127.0.0.1');
process.send({ port: app.getHttpServer().address().port });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on('message', message => {
  if (message === 'stop') { void close(); return; }
  if (message?.task === 'limit') {
    void app.get(RateLimitService).check(message.key, 3).then(
      () => process.send({ id: message.id, ok: true }),
      () => process.send({ id: message.id, ok: false }),
    );
  }
});
process.on('disconnect', () => { void close(); });
