# AuthServer — conformité à la conception et au modèle de menaces

Références : [conception](authserver-nestjs.md) et [menaces](authserver-menaces.md). Ce fichier décrit des preuves vérifiables, sans remplacer leurs exigences. L'API métier est un projet NestJS séparé ; son premier lot PostgreSQL/JWT/profils est disponible. Les [clients web et mobile natif](clients-web-mobile.md) exposent les parcours de compte et de profil.

## Organisation

| Responsabilité | Module et implémentation |
| --- | --- |
| Configuration validée | `authserver/src/config/` — `ConfigModule`, `ConfigService` |
| PostgreSQL et cycle de vie Prisma | `authserver/src/database/` — `DatabaseModule`, `Database`, `CleanupService` |
| Comptes et administration des utilisateurs | `authserver/src/identity/` — `IdentityModule`, `IdentityService`, contrôleurs dédiés |
| Mots de passe, vérification email, récupération et réauthentification | `authserver/src/credentials/` — `CredentialsModule`, `CredentialsService` |
| TOTP et codes de secours | `authserver/src/mfa/` — `MfaModule`, `MfaService` |
| Provider et adapter chiffré | `authserver/src/oidc/` — `OidcModule`, `OidcService`, `persistence/postgres.adapter.ts` |
| Login, consentement, refus et console OIDC | `authserver/src/interactions/` — `InteractionsModule`, contrôleurs distincts |
| Clients OAuth | `authserver/src/clients/` — `ClientsModule`, `ClientsController` |
| Fédération | `authserver/src/federation/` — `FederationModule`, `FederationController` |
| Sessions, grants et révocations | `authserver/src/sessions/` — `SessionsModule`, `SessionsService` |
| Clés et chiffrement | `authserver/src/keys/` — `KeysModule`, `KeysService` ; rotation par `scripts/rotate-keys.mjs` |
| Audit | `authserver/src/audit/` — `AuditModule`, `AuditService`, `AuditHttpModule` pour la consultation protégée |
| CSRF, limites PostgreSQL partagées et erreurs | `authserver/src/security/` — `SecurityModule`, `RateLimitService`, `http-security.ts` |
| Disponibilité | `authserver/src/health/` — `HealthModule`, `HealthController` |
| Emails | `authserver/src/mail/` — `MailModule`, `MailService` |
| OpenAPI et Swagger | `authserver/src/documentation/` ; montage dans `app.factory.ts` |

`AppModule` compose les modules. Les services reçoivent leurs dépendances par Nest ; `IdentityService` ne crée plus sa propre connexion Prisma et ne concentre plus mots de passe, MFA, audit et rate limiting. Le callback OIDC reste monté avant les body parsers Nest/Express destinés aux contrôleurs.

## Politiques explicites

- Les tokens d'identité utilisent `IDENTITY_AUDIENCE`, distinct de `API_AUDIENCE`. Les tokens destinés à l'API métier ne permettent pas l'administration de l'identité.
- Administration : audience identité, scope `tala.identity`, permission `tala.admin`, client présent dans `AUTH_ADMIN_CLIENT_IDS`, rôle `admin`, MFA activée et preuve `otp` de moins de cinq minutes. Ni un code de secours ni le rôle seul ne suffisent. L'inscription publique ne permet aucune attribution de rôle.
- Le client réservé de la console, `AUTH_REVIEW_CLIENT_ID`, conserve PKCE et les URI exactes. Un client non autorisé ne peut pas se faire attribuer `tala.admin` via l'API des clients.
- Access token : 300 secondes par défaut ; authorization code : 60 secondes. Les deux durées sont configurables et bornées.
- Refresh : rotation à chaque utilisation, plafond absolu de 14 jours, expiration après 7 jours sans utilisation par défaut. La rotation ne repousse pas le plafond absolu.
- Politique de rejeu stricte du provider : une seconde utilisation du même refresh token invalide le grant. Les clients doivent coordonner le renouvellement et ne garder qu'une demande en cours par session. Le serveur ne fournit pas de fenêtre de tolérance ou de réponse idempotente pour des refresh concurrents. La coordination des futurs BFF et applications mobiles reste à implémenter avec ces clients.
- Le verrou PostgreSQL au token endpoint est interprocessus et sérialise actuellement tous les échanges. Son remplacement par un verrou plus fin exige des mesures de charge et une nouvelle validation des courses.

## Preuves automatisées

Dans `authserver/test/integration.mjs`, sur un PostgreSQL local réel :

| Exigence | Vérification |
| --- | --- |
| Discovery/JWKS et frontières HTTP | Métadonnées cohérentes, absence de clés privées dans JWKS, CSP et cache |
| Login et compte | CSRF, messages génériques, email vérifié, hachage et usage unique des actions |
| OAuth et JWT | PKCE incorrect, signature/audience/issuer/expiration incorrects et ID token refusés |
| Administration | Refus sans rôle, scope, client autorisé, audience identité ou TOTP récent |
| Concurrence entre instances | Deux processus NestJS distincts contre la même base : un seul code échangeable, un seul refresh consommable, compteur partagé |
| Persistance et rotation | Arrêt et recréation de l'application, compte et session conservés, nouvelle signature et vérification de l'ancienne sur une nouvelle instance |
| Durées des refresh tokens | Expiration d'inactivité persistée et plafond absolu refusé même si l'objet est encore stocké |
| MFA | Activation, invalidation des sessions, TOTP anti-rejeu, renouvellement et consommation des codes de secours |
| Propriété | Refus de révoquer le grant d'un autre utilisateur |
| Fédération | Faux fournisseur de test explicite, validation du retour OIDC, pas de fusion par email, maintien d'un moyen de connexion |
| Données | Export sans secrets, suppression du compte, chiffrement authentifié et refus après altération |

Les tests utilisent un port disponible, un client OAuth unique et une copie temporaire des clés. Ils ne stoppent pas l'application du développeur sur le port 4000 et ne modifient pas son jeu de clés.

## Critères encore ouverts

Ces critères ne sont pas annoncés comme validés :

- API métier : la vérification des access tokens et la propriété des profils sont livrées dans le [lot API/profils](api-profils.md). Restent la propagation idempotente des créations/suspensions et suppressions, le contrôle actif des opérations sensibles et les autorisations des futurs contenus et paiements.
- Clients web/mobile réels : coordination des refresh, effets du logout entre appareils et BFF, stockage OS et sessions BFF.
- Déploiement : construction et exécution des images Docker, reverse proxy HTTPS et domaine stable, comptes PostgreSQL distincts avec privilèges limités, pipelines et secrets de l'environnement cible.
- Exploitation : sauvegarde/restauration PostgreSQL et clés sur une installation distincte, rotation progressive entre instances en charge, mesures Argon2 et tests de charge.
- Intégrations SMTP et Google/Apple réelles, et suite de conformité OIDC adaptée. Le fournisseur factice des tests ne valide pas les intégrations externes.

Le test de redémarrage et de chevauchement des signatures n'est pas un exercice de restauration de sauvegarde. La réussite des tests locaux ne clôt pas le lot de déploiement de la conception.
