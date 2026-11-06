import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Database } = require('../dist/database/database.service.js');
const email = process.argv[2];
if (!email) throw new Error('Usage : node scripts/promote-admin.mjs adresse-email. Le compte doit déjà être vérifié.');
const db = new Database();
try {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user?.active || !user.emailVerified) throw new Error('Compte actif et vérifié requis.');
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { role: 'admin' } }),
    db.oidcArtifact.deleteMany({ where: { accountId: user.id } }),
    db.auditEvent.create({ data: { userId: user.id, event: 'admin.bootstrap', detail: { source: 'local-cli' } } }),
  ]);
  console.log('Rôle administrateur attribué. Activer la MFA puis se reconnecter avec un code TOTP pour accéder aux routes admin.');
} finally { await db.$disconnect(); }
