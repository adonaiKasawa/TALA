# Documentation TALA

Mise à jour : 4 novembre 2026.

Ce dossier décrit le produit et l'architecture cible. L'AuthServer NestJS possède son [guide de vérification](../authserver/VERIFICATION.md). Le projet `api/` implémente le socle PostgreSQL, la validation des access tokens et les profils ; le premier pipeline vidéo est livré pour les essais locaux ; les autres modules métier restent à développer.

- [Catalogue des fonctionnalités](fonctionnalites.md) : périmètre complet issu des échanges, priorités proposées et points à arbitrer.
- [Brief de transformation design TALA](design-transformation.md) : brief fourni par le porteur du projet, identité visuelle, audit obligatoire et refonte progressive web/mobile.
- [Regard — refonte web et mobile](design-regard.md) : direction actuelle, couleurs des logos, fil immersif et navigation ; remplace la direction verte du premier lot.
- [Validation du design](design-validation.md) : compilations, contrôles de rendu et limites.
- [Fil et premier montage mobile](montage-mobile-implementation.md) : gestes, interactions, création simplifiée, recette de montage et préparation FFmpeg.
- [Backend comptes, découverte et social](backend-comptes-decouverte-social.md) : état récent des contrats livrés, permissions, recommandations et fonctions dont les interfaces restent à réaliser.
- [Architecture backend](architecture-backend.md) : API, identité interne, données, traitements et déploiement VPS.
- [AuthServer NestJS](authserver-nestjs.md) : service d'identité indépendant, modules, parcours et étapes de réalisation.
- [Conformité de l'AuthServer](authserver-conformite.md) : correspondance entre exigences, implémentation, tests et critères encore ouverts.
- [API et profils](api-profils.md) : contrats, permissions, migrations, tests et rapprochement avec les fonctionnalités.
- [Implémentation vidéo et commandes sans Docker](videos-implementation.md) : parcours 1–5, configuration, sécurité et limites.
- [Visionnage P0, fil et interactions](visionnage-implementation.md) : lecteurs web/mobile, événements, historique et communauté ; complété par le lot backend comptes, découverte et social.
- [Compression et publication vidéo](pipeline-video.md) : préparation avant Mux, qualité, coûts et contrôles.
- [Conversation de référence sur les recommandations vidéo](recommandations-video-conversation.md) : restitution en 19 parties, signaux, modèles, événements, exemples, références et progression proposée pour TALA.
- [ADR-001 — Ancienne proposition .NET, remplacée](decisions/001-identite-interne-openiddict.md).
- [ADR-002 — Prétraitement vidéo avant Mux](decisions/002-pretraitement-video-mux.md).
- [ADR-003 — AuthServer NestJS + oidc-provider](decisions/003-authserver-nestjs-oidc-provider.md).

## Décisions de référence

1. Le backend métier reste un monolithe modulaire NestJS, avec un worker asynchrone.
2. Supabase Auth est supprimé de l'architecture cible. TALA gère ses comptes et son serveur d'identité OAuth 2.0/OpenID Connect.
3. L'AuthServer est un service NestJS/TypeScript indépendant utilisant `oidc-provider` comme moteur OAuth/OIDC. Aucun service .NET n'est retenu. Les comptes et interactions sont développés dans TALA.
4. PostgreSQL est la base relationnelle. Son hébergement sur VPS ou chez un fournisseur géré reste à choisir ; il ne conditionne pas le choix de l'authentification.
5. Un prétraitement vidéo contrôlé précède l'envoi à Mux. L'objectif est de préserver la qualité perceptuelle et de réduire les transferts ; une réduction des octets ne garantit pas une baisse du stockage facturé par Mux.

Les priorités P0/P1/P2 et les paramètres techniques proposés sont un plan de travail, pas des fonctionnalités déjà réalisées. La couverture exacte des fonctions concurrentes varie selon les pays, les comptes et les déploiements.
