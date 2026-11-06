# ADR-001 — Identité interne OAuth 2.0/OpenID Connect

## Statut

**Remplacé le 28 octobre 2026 par [ADR-003](003-authserver-nestjs-oidc-provider.md).** Le porteur du projet refuse .NET et impose un AuthServer NestJS séparé. Le texte ci-dessous conserve uniquement la proposition historique ; il ne décrit plus la cible. La suppression de Supabase Auth reste décidée.

## Date

20 octobre 2026.

## Contexte

La proposition précédente utilisait Supabase Auth avec NestJS. Le projet demande désormais ses propres comptes et les principes OAuth/OIDC d'OpenIddict. OpenIddict est une bibliothèque .NET ; il gère les protocoles, sans imposer la gestion des comptes.

## Décision

Supprimer Supabase Auth de la cible. Utiliser un serveur d'identité auto-hébergé ASP.NET Core Identity + OpenIddict, et conserver NestJS pour le métier. Les clients utilisent Authorization Code avec PKCE ; le web privilégie un BFF et le mobile un navigateur système. L'API valide des access tokens TALA et applique ses permissions.

L'identité et le métier possèdent leurs données et migrations, même si leurs bases partagent un serveur PostgreSQL. Le choix d'hébergeur PostgreSQL reste indépendant.

## Alternatives considérées

- Supabase Auth : ne correspond plus à la demande de contrôle interne.
- Réécrire OAuth/OIDC et la cryptographie dans NestJS : maintenance et conformité inutiles ; utiliser une bibliothèque éprouvée.
- Passer tout le métier à .NET : possible, mais non nécessaire pour satisfaire ce besoin et non décidé.
- Fournisseur d'identité externe : ne répond pas au choix actuel d'un serveur interne fondé sur OpenIddict.

## Conséquences

Deux environnements applicatifs à maintenir, TypeScript et .NET. TALA prend en charge les comptes, sessions, MFA, récupération, clés, fédération et exploitation. Le fonctionnement JWT signé/JWKS nécessite une configuration explicite des access tokens OpenIddict et une stratégie de révocation adaptée aux opérations sensibles.

Les contrats et vérifications sont décrits dans [architecture-backend.md](../architecture-backend.md).

## Sources

- [Présentation OpenIddict](https://documentation.openiddict.com/introduction).
- [Formats des tokens](https://documentation.openiddict.com/configuration/token-formats).
