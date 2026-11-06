# Dépendances et reproduction

Les deux projets ont été générés avec Nest CLI, puis installés indépendamment avec npm et leur lockfile respectif. `.npmrc` désactive les scripts d'installation ; la génération Prisma est exécutée explicitement. Les clients natifs Argon2 utilisent les paquets binaires de la distribution npm, sans compilation automatique de scripts tiers.

Prisma est passé à 7.10.1 avec son adapter PostgreSQL pour supprimer les alertes élevées de l'ancienne CLI. Multer est contraint à 2.5.0 dans les deux projets pour corriger l'alerte remontée dans la dépendance du framework. Aucun endpoint de téléversement n'est ajouté à l'AuthServer.

L’AuthServer utilise `@nestjs/swagger` 11, compatible avec NestJS 11. Sa dépendance `js-yaml` est contrainte à 5.5.0 pour corriger l’alerte GHSA-r3ph-w7gj-g6xm, sans imposer une migration majeure du framework.

L'audit npm des dépendances d'exécution de l'AuthServer est sans alerte connue au contrôle du 28 octobre 2026. L'audit complet inclut encore des alertes faibles/modérées des outils de développement générés par Nest (tests/lint/CLI). Elles n'ont pas été corrigées par une mise à jour majeure forcée ; les réévaluer avant publication et au plus tard le 28 novembre 2026. Un audit sans alerte ne remplace pas les tests de l'application.

Les Dockerfiles utilisent Node.js 24 LTS et excluent les dépendances de développement des images finales. Les constructions Docker n'ont pas été exécutées sur ce poste, dont le moteur Docker n'est pas opérationnel. Les secrets et clés doivent être fournis au lancement ; la migration est une opération séparée avant le démarrage de l'image finale.

Au 2 novembre 2026, l'API utilise aussi Prisma/adapter PostgreSQL 7.10.1, `jose`, Zod, Helmet et Swagger 11, avec le correctif `js-yaml` 5.5.0. Son audit npm des dépendances d'exécution ne remonte aucune alerte connue. Les scripts d'installation restent désactivés ; le client Prisma doit être généré explicitement avant compilation.

L'audit complet de l'API remonte 45 alertes dans l'arbre de développement (4 faibles, 41 modérées, aucune élevée ou critique). Cet arbre est exclu de l'image finale. La mise à niveau des outils de génération, de tests et de lint est différée pour préserver le lot fonctionnel et doit être réévaluée avant publication, au plus tard le 28 novembre 2026 ; aucun correctif forcé de versions majeures n'a été appliqué.
