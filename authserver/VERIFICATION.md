# AuthServer TALA — Utilisation et vérification

## État

Application NestJS créée avec `nest new authserver`, indépendante du projet `api`. Elle utilise NestJS 11, `oidc-provider` 9.13.1, Prisma 7.10.1 et PostgreSQL. Aucun code .NET, Supabase Auth ou générateur parallèle n'est utilisé.

Les responsabilités sont organisées en modules NestJS. Le [suivi de conformité](../docs/authserver-conformite.md) distingue les contrôles testés des critères de déploiement encore ouverts.

Les fonctionnalités d'identité sont disponibles pour vérification locale. Les intégrations Google/Apple réelles, le SMTP réel et le déploiement HTTPS nécessitent les paramètres de leurs propriétaires. Les tests automatisés de fédération utilisent un fournisseur OIDC local et ne valent pas certification du produit.

## Démarrage sur ce poste

La base `tala_authserver` et le fichier `.env` sont configurés. La migration initiale a été appliquée sans réinitialiser PostgreSQL. La base `tala_db` est réservée à l'API et n'a pas été migrée par l'AuthServer.

Depuis `authserver` :

```powershell
npm run db:generate
npm run db:migrate
npm run build
npm run start:prod
```

Ouvrir **http://localhost:4000**, avec le même nom d'hôte que `OIDC_ISSUER`. La console de connexion est accessible à `/review`. Le processus écoute uniquement en local par défaut.

`start:prod` utilise Node.js LTS installé, ou le Node.js 24 portable présent dans `.local/node24` sur ce poste. Garder une seule instance sur le port 4000 ; arrêter le serveur avec `Ctrl+C` avant de le relancer.

Pour une nouvelle installation : installer Node.js 24 LTS, exécuter `npm ci --ignore-scripts`, puis `npm run setup:local`. Éditer `.env` avant les migrations. `setup:local` crée les clés persistantes et ne remplace pas les secrets déjà présents. Prisma doit être généré explicitement, car les scripts d'installation automatiques sont désactivés.

## Vérifier un compte

Pour le parcours client sans JSON, utiliser désormais les [interfaces web et mobile](../docs/clients-web-mobile.md) : `npm run dev` à la racine, espace client sur `http://localhost:3000`, emails de développement dans `http://localhost:8025`. Les instructions ci-dessous concernent la console technique historique.

1. Ouvrir `/register` et créer un compte avec un mot de passe d'au moins 12 caractères.
2. Sans SMTP configuré, afficher l'email de développement avec cette commande locale :

```powershell
node scripts/mailbox.mjs votre-adresse@example.com
```

3. Ouvrir le lien de vérification affiché et confirmer le formulaire. Le lien n'est consommé qu'au POST, pas à sa simple ouverture.
4. Ouvrir `/review`, se connecter, puis autoriser les accès demandés.
5. Consulter le profil, les sessions et les autorisations. La console garde l'access token côté serveur et ne le place pas dans le stockage du navigateur.
6. Pour vérifier la MFA : préparer la MFA depuis la console, conserver le `secret`/URI reçu, l'ajouter à une application d'authentification, revenir à `/review/account`, puis confirmer le code. Conserver les dix codes de secours affichés une seule fois.
7. L'activation MFA révoque les sessions existantes. Se reconnecter avec un nouveau code TOTP ; un même code déjà accepté ne peut pas être rejoué.

La console est volontairement simple : les opérations renvoient parfois du JSON. Elle permet la vérification du backend, pas la présentation finale de l'application. Sa session locale dure cinq minutes ; reprendre `/review` si elle expire. Le bouton de fermeture de console ferme uniquement cette session ; la déconnexion OIDC et la révocation des appareils sont des opérations distinctes.

Le script de boîte email affiche des liens secrets : ne pas publier sa sortie. Il est désactivé en production. En production, configurer `SMTP_URL` et `MAIL_FROM` ; un outbox PostgreSQL chiffré assure les tentatives de remise (cinq maximum). Les erreurs de remise sont auditées sans journaliser les liens.

## Endpoints de compte

L’interface **Swagger UI** est disponible à **http://localhost:4000/docs** pour consulter et essayer les endpoints REST. Le bouton **Authorize** accepte un access token TALA destiné à `IDENTITY_AUDIENCE` (`urn:tala:identity` par défaut), avec le scope `tala.identity`. L'administration exige aussi `tala.admin`, un client déclaré dans `AUTH_ADMIN_CLIENT_IDS`, le rôle administrateur et une MFA TOTP récente. Avec une session de console, les écritures exigent aussi le jeton obtenu via `/account/csrf`, à saisir dans `X-CSRF-Token`. Les autorisations ne sont pas conservées après rechargement de Swagger.

Les tokens de l'API métier (`API_AUDIENCE`) sont refusés par les endpoints d'identité. Après cette séparation des audiences, se reconnecter à `/review` pour obtenir une nouvelle session de console. Les valeurs par défaut des nouvelles variables fonctionnent avec le `.env` local existant ; la référence complète reste `.env.example`.

Les durées `AUTH_ACCESS_TOKEN_TTL`, `AUTH_CODE_TTL`, `AUTH_REFRESH_IDLE_TTL` et `AUTH_REFRESH_ABSOLUTE_TTL` sont exprimées en secondes. Les refresh tokens suivent une politique de rejeu stricte : les clients doivent n'envoyer qu'une demande de renouvellement à la fois par session. La réutilisation d'un ancien refresh invalide le grant.

La description REST OpenAPI reste disponible à **http://localhost:4000/openapi.json** pour import dans un client API. Les endpoints OAuth/OIDC utilisent la découverte standard, séparée de cette description REST.

Les requêtes JSON sont validées côté serveur. Pour les actions publiques, obtenir d'abord `GET /account/csrf`, conserver les cookies, puis transmettre la valeur reçue dans `X-CSRF-Token` ou dans le champ `csrf`. Les requêtes authentifiées par cookie exigent aussi la protection CSRF ; les appels par access token utilisent `Authorization: Bearer ...`.

| Méthode | Chemin | Corps ou résultat |
| --- | --- | --- |
| GET | `/health/live` | Disponibilité du processus |
| GET | `/health/ready` | Connexion PostgreSQL |
| POST | `/account/register` | `email`, `username`, `password` |
| POST | `/account/email/request` | `email` |
| POST | `/account/email/confirm` | `token` à usage unique |
| POST | `/account/password/request` | `email`, réponse générique |
| POST | `/account/password/reset` | `token`, nouveau `password` |
| GET/PATCH | `/account/me` | Profil / modification du `username` |
| POST | `/account/password/change` | `currentPassword`, nouveau `password` |
| POST | `/account/mfa/enroll` | `password` actuel ; retourne secret/URI |
| POST | `/account/mfa/confirm` | `code` ; retourne les codes de secours |
| POST | `/account/mfa/disable` | `password`, `code` TOTP ou de secours |
| POST | `/account/mfa/recovery-codes` | `password`, `code` ; remplace les codes et révoque les sessions |
| GET | `/account/sessions` | Sessions actives appartenant au compte |
| DELETE | `/account/sessions/:id` | Révoquer un appareil |
| POST | `/account/sessions/revoke-all` | Révoquer les accès de tous les appareils |
| GET | `/account/grants` | Autorisations des applications |
| DELETE | `/account/grants/:id` | Retirer un consentement et les tokens associés |
| GET | `/account/identities` | Fournisseurs externes associés |
| POST | `/account/identities/:provider/link` | Réauthentification puis URL du fournisseur |
| DELETE | `/account/identities/:provider` | Réauthentification ; dernier moyen de connexion conservé |
| GET | `/account/export` | Données personnelles d'identité, sans hash ou secret MFA |
| DELETE | `/account/me` | Réauthentification puis suppression des données d'identité |

Pour un compte exclusivement fédéré sans mot de passe local, une authentification fédérée datant de moins de cinq minutes remplace la preuve par mot de passe pour les actions prévues à cet effet. La première définition d'un mot de passe local utilise `/account/password/change` après cette réauthentification.

## OAuth 2.0 / OpenID Connect

La découverte `/.well-known/openid-configuration` fournit les URLs à utiliser. Routes configurées par le provider : autorisation `/auth`, émission `/token`, informations `/me`, clés publiques `/jwks`, introspection `/token/introspection`, révocation `/token/revocation`, déconnexion `/session/end`.

- Authorization Code avec **PKCE S256** ; aucun Password Grant ni Implicit Flow.
- Ressource API `urn:tala:api` par défaut ; access tokens JWT RS256 de cinq minutes.
- Scopes : `openid profile email offline_access tala.api tala.identity tala.admin`, limités par client et par ressource ; `tala.admin` est réservé aux clients configurés pour l'administration.
- Pour un refresh token, enregistrer le grant type correspondant et demander `offline_access` avec consentement explicite (`prompt=consent`). Rotation à chaque renouvellement et refus de la réutilisation.
- `client_credentials` pour les services confidentiels autorisés ; aucun accès aux comptes utilisateurs avec ce type de token.
- ID tokens et access tokens ne sont pas interchangeables.
- Validation de signature, type, issuer, audience, expiration, scope, session et grant pour les opérations de compte.
- Cookies signés, CSRF, outbox et objets protocolaires chiffrés, mots de passe Argon2id, limites partagées PostgreSQL et audit des événements sensibles.

Les échanges POST `/token` sont sérialisés par un verrou PostgreSQL global avec un pool distinct pour empêcher les courses concurrentes lors des échanges de codes et refresh tokens. Cette stratégie conservatrice doit être mesurée avant une montée en charge ; elle n'est pas présentée comme une architecture à débit illimité.

## Administration

Après création et vérification de votre propre compte :

```powershell
node scripts/promote-admin.mjs votre-adresse@example.com
```

Cette commande locale attribue le rôle administrateur et invalide les sessions. Les endpoints administratifs exigent aussi la MFA active et une authentification TOTP récente (cinq minutes). Un code de secours ne remplace pas cette preuve TOTP pour l'administration.

| Méthode | Chemin | Fonction |
| --- | --- | --- |
| GET | `/admin/users` | Derniers comptes, sans secrets |
| PATCH | `/admin/users/:id` | Statut `active` et rôle `user`/`admin`, avec révocation des sessions |
| GET/POST | `/admin/clients` | Liste / enregistrement d'une application |
| DELETE | `/admin/clients/:id` | Suppression d'un client et de ses grants |
| GET | `/admin/audit` | Derniers événements de sécurité |

Exemple de corps pour créer une application publique :

```json
{
  "client_id": "tala-web",
  "client_name": "Web TALA",
  "kind": "public",
  "redirect_uris": ["http://localhost:3000/auth/callback"],
  "post_logout_redirect_uris": ["http://localhost:3000"],
  "scope": "openid profile email offline_access tala.api"
}
```

Les types sont `public`, `confidential` et `service`. Un service utilise `scope: "tala.api"` et n'a pas de redirect URI. Le secret d'un client confidentiel/service est rendu uniquement à la création ; il est retiré des listes. Les URI HTTP locales sont limitées au développement ; HTTPS ou schéma mobile `tala:` selon le client en production. Les règles métier de créateur/modérateur appartiendront à l'API ; le rôle d'administration de l'identité n'accorde pas automatiquement ces permissions.

## Fédération Google/Apple ou autre fournisseur OIDC

Créer un fichier privé `.local/federation.json`, puis définir `FEDERATION_PROVIDERS_PATH=.local/federation.json` :

```json
[
  {
    "id": "google",
    "issuer": "https://accounts.google.com",
    "clientId": "CLIENT_ID_FOURNISSEUR",
    "clientSecret": "SECRET_FOURNISSEUR",
    "scopes": "openid email profile"
  }
]
```

Enregistrer `${OIDC_ISSUER}/federation/google/callback` chez le fournisseur. La connexion apparaît sur le formulaire de login. Les retours `query` (GET) et `form_post` (POST) sont pris en charge. Pour Apple, prévoir notamment `issuer: "https://appleid.apple.com"`, les scopes `openid email name`, `responseMode: "form_post"`, un issuer TALA HTTPS et un client secret Apple valide ; aucun identifiant fournisseur n'est fourni par le dépôt. Le cookie de liaison form_post utilise SameSite=None/Secure. Les essais réels Google/Apple restent à effectuer avec vos configurations.

L'association est fondée sur l'issuer et le sujet du fournisseur. Un email déjà utilisé ne provoque jamais de fusion automatique : associer le fournisseur depuis le compte existant.

## Tests et contrôles

Les tests d'intégration choisissent un port disponible et leur propre client OAuth ; le serveur manuel peut rester lancé. Ils utilisent une copie temporaire des clés, créent des comptes et un fournisseur local temporaires, puis retirent leurs données ; ils ne réinitialisent pas la base. Ne pas les exécuter contre une base de production.

```powershell
npm test -- --runInBand
npm run test:integration
node node_modules/eslint/bin/eslint.js "src/**/*.ts"
npm audit --omit=dev
```

Les scénarios couvrent notamment vérification d'email, PKCE, mauvais issuer/audience/type/expiration, concurrence entre deux processus pour les codes et refresh, limites partagées, redémarrage et rotation des clés, durée absolue/inactivité des refresh, gestion du compte, MFA et récupération, permissions admin, Client Credentials, révocation, fédération et suppression. Les contrôles de protocoles ne constituent pas une certification OIDC de TALA.

## Exploitation

Les clés `.local/jwks.json`, `AUTH_ENCRYPTION_KEY` et `AUTH_COOKIE_KEYS` sont persistantes, privées et indépendantes de l'API. Ne pas les régénérer au redémarrage. `node scripts/rotate-keys.mjs` ajoute une clé en conservant les précédentes ; redémarrer les instances de manière coordonnée et conserver les clés nécessaires aux objets encore valides.

Rétention courante : emails de transit un jour, audit trente jours, actions et objets temporaires jusqu'à leur expiration puis nettoyage périodique. La suppression de compte retire ses identifiants et associations, les sessions/grants et emails liés ; l'audit lié est anonymisé. Les tentatives fédérées intermédiaires expirent au plus tard après dix minutes. Une restauration de sauvegarde nécessite de réappliquer les suppressions récentes ; la politique des sauvegardes reste à définir au déploiement.

En production : Node.js 24 LTS, issuer HTTPS stable, SMTP, clés persistantes sauvegardées, reverse proxy explicitement déclaré, utilisateur PostgreSQL dédié et accès réseau privé. L'instance Node.js 26.8.1 du poste initial émet un avertissement de support du provider ; elle ne constitue pas la cible de déploiement. Les Dockerfiles utilisent Node.js 24 LTS ; leur construction nécessite Docker opérationnel.
