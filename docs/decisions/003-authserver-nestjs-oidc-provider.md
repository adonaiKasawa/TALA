# ADR-003 — AuthServer NestJS indépendant avec oidc-provider

## Statut et date

Décision de rester en NestJS imposée par le porteur du projet le 28 octobre 2026. `oidc-provider` est le moteur retenu. Remplace [ADR-001](001-identite-interne-openiddict.md). Une première implémentation est disponible dans `authserver/`, pour vérification locale.

## Contexte

La référence initiale à OpenIddict exprimait un besoin de serveur OAuth/OIDC interne, pas un accord pour un service .NET. Le document fourni par le porteur du projet propose NestJS et `oidc-provider`, avec persistance et interactions développées dans TALA.

## Décision

Construire `tala-auth` en NestJS/TypeScript avec `oidc-provider`, PostgreSQL/Prisma et un adapter protocolaire persistant. Garder `tala-api` comme service NestJS métier séparé. Utiliser un client OIDC éprouvé pour la fédération et des bibliothèques de hachage/signature maintenues.

L'AuthServer gère comptes, identifiants, MFA, sessions, clients et consentements. Le provider est la source de vérité du protocole ; il n'est pas remplacé par un contrôleur `/login` fabriquant ses propres JWT. L'API conserve les permissions métier et valide les access tokens pour sa ressource.

## Conséquences

Pile applicative TypeScript homogène ; déploiements, secrets et données indépendants entre identité et API. Les comptes, interactions, adapter, rotation des clés et contrôles de concurrence restent à implémenter et tester. La prise en charge de standards par la bibliothèque ne certifie pas automatiquement le produit TALA.

## Alternatives

- .NET/OpenIddict : rejeté par le porteur du projet.
- Contrôleurs JWT/Passport seuls : utiles pour d'autres usages, mais insuffisants comme serveur OAuth/OIDC complet.
- Protocole écrit intégralement à la main : coût et risque de maintenance injustifiés.

## Référence

[Conception AuthServer](../authserver-nestjs.md) et [provider officiel](https://github.com/panva/node-oidc-provider).
