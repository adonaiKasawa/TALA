import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Database } = require('../dist/database/database.service.js');
const { Vault } = require('../dist/security/crypto.js');
const { loadConfig } = require('../dist/config/config.js');
if (process.env.NODE_ENV === 'production') throw new Error('Boîte locale interdite en production. Configurer SMTP.');
const email = process.argv[2];
if (!email) throw new Error('Usage : node scripts/mailbox.mjs adresse-email');
const identity = { db: new Database(), vault: new Vault(loadConfig().AUTH_ENCRYPTION_KEY) };
try {
  const user = await identity.db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error('Compte introuvable.');
  const messages = await identity.db.mail.findMany({ where: { userId: user.id }, take: 5, orderBy: { createdAt: 'desc' } });
  for (const message of messages) {
    const content = identity.vault.open(message.content);
    console.log(`${content.subject}\n${content.text}\n`);
  }
} finally { await identity.db.$disconnect(); }
