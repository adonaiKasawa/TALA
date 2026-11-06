# TALA Web

Next.js 16.4.4 créé avec create-next-app officiel. BFF connecté aux services NestJS.

Depuis la racine, `npm run dev` démarre les services et la boîte email locale. Ouvrir http://localhost:3000. Après modification : `npm run build` ici puis relancer le lanceur. Ne pas publier .env.local.

Validation : `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e` (backends construits, PostgreSQL et Edge disponibles).

Voir [le guide complet](../docs/clients-web-mobile.md).
