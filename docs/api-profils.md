# API — socle, accès et profils

Mise à jour : 2 novembre 2026. Périmètre : points 1, 2 et 3 du lot API. Les interfaces, vidéos, fonctions sociales et paiements ne sont pas inclus.

## Socle et données

Le projet `api/`, initialement créé avec `nest new api`, reste un monolithe modulaire NestJS indépendant de l'AuthServer. Les modules sont `config`, `database`, `auth`, `profiles`, avec disponibilité, sécurité HTTP et documentation. La configuration est validée au démarrage ; les erreurs n'exposent ni requêtes SQL ni secrets.

Prisma 7 et son adapter PostgreSQL utilisent exclusivement `DATABASE_URL`, configuré localement pour `tala_db`. La migration `202611020001_profiles` ajoute `Profile`, ses contraintes d'unicité et les compteurs partagés `RateBucket`. Elle a été appliquée sans réinitialisation de la base. L'API ne lit ni les tables de `tala_authserver` ni ses clés privées.

Chaque profil possède un identifiant métier et une association unique `(issuer, subject)` issue du token validé. Aucun mot de passe, secret MFA, refresh token ou email d'identité n'est copié dans cette table. Le pseudonyme métier est distinct du pseudonyme de connexion de l'AuthServer ; il est normalisé en minuscules et unique dans `tala_db`.

## Accès et permissions

- Toutes les routes métier sont protégées par défaut. Les routes de disponibilité sont publiques ; la consultation d'un profil accepte un visiteur anonyme, mais refuse un token invalide s'il est fourni.
- Vérification avec `jose` : signature RS256, type `at+jwt`, issuer fixé, audience `API_AUDIENCE`, expiration, date d'émission et scope `tala.api`. Une session utilisateur (`sid`, `gid`) est requise pour gérer les profils. Les ID tokens et Client Credentials ne représentent pas un utilisateur.
- Le JWKS vient exclusivement de `${OIDC_ISSUER}/jwks`, chemin du serveur TALA. Les URLs `jku` et issuers contenus dans un token non vérifié ne servent jamais à choisir une clé. Les clés publiques sont mises en cache ; une nouvelle clé peut être récupérée après le délai de protection de cinq secondes.
- Les routes `/me/profile` utilisent exclusivement le sujet authentifié. Aucun identifiant de propriétaire ou rôle ne peut être attribué par le corps JSON.
- La validation JWT est locale : un token déjà émis peut rester accepté jusqu'à son expiration après une révocation côté AuthServer. Les futurs paiements, retraits et autres opérations sensibles devront ajouter le contrôle actif prévu dans la conception. Ce lot ne réalise pas la propagation des suspensions ou suppressions de comptes.
- Les compteurs partagés PostgreSQL limitent les lectures à 200/minute/IP et les écritures à 30/minute/IP. Les IP ne sont stockées que sous forme de clé hachée. Le serveur ignore les en-têtes forwarded tant qu'aucune politique de proxy de confiance n'est configurée. Les dates du compteur sont exprimées en UTC, indépendamment du fuseau PostgreSQL.
- Les réponses métier sont `Cache-Control: no-store`, les en-têtes Helmet sont conservés et les corps JSON sont limités à 32 Kio. Aucune politique CORS large n'est activée.

## Contrats disponibles

Préfixe : `/api/v1`. Swagger : `/docs` ; document OpenAPI : `/docs-json`.

| Méthode | Route | Résultat |
| --- | --- | --- |
| GET | `/health/live` | Présence du processus |
| GET | `/health/ready` | Accès PostgreSQL |
| POST | `/me/profile` | Création du profil du sujet connecté ; 409 si compte ou pseudonyme déjà utilisé |
| GET | `/me/profile` | Profil et préférences du propriétaire ; 404 avant création |
| PATCH | `/me/profile` | Modification des seuls champs fournis |
| DELETE | `/me/profile` | Suppression idempotente du profil métier du propriétaire |
| GET | `/profiles/:username` | Vue publique, vue privée réduite, ou vue complète pour le propriétaire |

Champs modifiables : `username`, `displayName`, `avatarUrl`, `bio`, `links`, `isPrivate`, `languages`, `country`, `interests`, `locale`. Les réponses propriétaires regroupent les préférences dans `preferences`. Les langues sont des tags BCP 47 canoniques ; le pays est un code de deux lettres normalisé en majuscules. Les liens et l'avatar sont des URLs HTTPS sans identifiants, jamais téléchargés par l'API. Le téléversement d'image relève d'un futur lot média.

Un visiteur peut consulter pseudonyme, nom, avatar et statut privé. Si le profil est public, la bio et les liens sont aussi visibles. Les préférences, `issuer` et `subject` ne figurent pas dans la vue d'un autre utilisateur. Les détails d'un profil privé sont masqués jusqu'au futur système d'abonnements approuvés ; celui-ci n'est pas simulé.

La suppression du profil ne supprime pas le compte de connexion. Le workflow de suppression coordonnée du compte reste une fonctionnalité distincte à réaliser entre les deux services.

## Rapprochement avec le catalogue

| Élément de `fonctionnalites.md` | État du backend | Preuve |
| --- | --- | --- |
| Socle API PostgreSQL/Prisma séparé | Implémenté | Migration et test de la base réelle |
| Validation des access tokens de l'AuthServer | Implémentée | Authorization Code + PKCE réel, refus des mauvais tokens et rotation JWKS |
| Permissions sur son profil | Implémentées | Tests d'accès entre deux utilisateurs et refus des champs d'identité/rôle |
| Pseudonyme unique, photo, bio et liens | Implémentés ; avatar par URL | Création, normalisation, contraintes et tests d'unicité concurrente |
| Langues, pays, intérêts et paramètres | Implémentés | Préférences privées, validation et mises à jour partielles |
| Compte privé et demandes d'abonnement | Partiel | Masquage du profil testé ; demandes d'abonnement non implémentées |
| Gestion et suppression du compte | Partiel | Profil métier géré et supprimé ; workflow global encore ouvert |
| Cinq rôles métier, modération et administration métier | À réaliser | Le contrôle de propriété ne livre pas l'ensemble des rôles |
| Export et suppression globaux des données | À réaliser | Consulter ses champs de profil ne livre pas un export global des futurs contenus |

## Lancer et vérifier

Utiliser Node.js 24 LTS. Depuis `api/` :

```powershell
npm ci --ignore-scripts
npm run db:generate
npm run db:migrate
npm run build
npm run start:prod
```

Les valeurs privées de `.env` sont déjà configurées sur ce poste ; `.env.example` contient uniquement des exemples. Il n'est pas nécessaire de réinitialiser les bases. L'API écoute par défaut sur `127.0.0.1:4001`. Les futurs clients doivent demander un access token pour la ressource `urn:tala:api` ; le token de la console d'identité vise une autre audience et sera refusé.

Les tests automatisés se lancent sans saisie de JSON manuelle :

Validation locale du lot : compilation et lint réussis, un test unitaire et douze tests d'intégration réussis. La réinstallation figée par `npm ci --ignore-scripts` a aussi été vérifiée.

```powershell
npm test -- --runInBand
npm run test:integration
npm run lint
```

Le test d'intégration nécessite les dépendances des deux projets, les clients Prisma générés et leurs migrations locales. Il compile les deux services, utilise des ports disponibles, des utilisateurs et clients temporaires et un jeu de clés de test. Les tokens sont réellement émis par `oidc-provider` dans l'AuthServer. Les contrôles négatifs utilisent aussi des tokens de test signés pour isoler chaque politique. Aucune clé de production n'est remplacée et aucune base n'est réinitialisée ; seules les données propres aux tests sont retirées.

Les images Docker n'ont pas été construites sur ce poste. Les tests locaux ne valident pas le proxy HTTPS, les sauvegardes ou les intégrations de production. Pour annuler une migration ayant déjà reçu des données, restaurer une sauvegarde contrôlée plutôt que lancer un reset ; aucune suppression automatique de tables n'est prévue au démarrage.

Depuis le 3 novembre 2026, les points 1–3 de ce lot sont consommés par les interfaces Next.js et React Native natives. Voir [les parcours client](clients-web-mobile.md) : création/modification, préférences, consultation publique/privée, export et suppression du profil. La fermeture actuelle du compte est une séquence client profil puis identité, avec erreur partielle ; l'orchestration durable des futurs contenus reste ouverte.
