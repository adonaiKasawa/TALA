# Validation de la refonte Regard — 5 novembre 2026

Direction actuelle : [design-regard.md](design-regard.md). Les résultats ci-dessous concernent la reprise réalisée par l’agent principal, pas les résultats historiques de l’ancien lot vert.

## Compilations et contrôles

| Contrôle | Résultat |
| --- | --- |
| Build production web | Réussi dans la sortie habituelle `web/.next`, avec TypeScript |
| Build AuthServer | Réussi dans `authserver/dist` |
| ESLint web | Réussi sur `src` |
| TypeScript et ESLint mobile | Réussis sur les composants modifiés |
| Jest mobile | 4 suites, 10 tests réussis ; accueil, sessions, buffers, activation du lecteur et sous-titres |
| Jest identité | 2 suites, 5 tests unitaires réussis, dont la politique des formulaires |
| Bundle Android | Généré par le CLI React Native ; les nouveaux PNG sont résolus et copiés parmi 48 assets |
| Identité rendue dans Edge | 320 / 540 / 1440 px ; aucun débordement, formulaire POST, action et CSRF conservés |
| Web public réel | Une vidéo existante lue avec progression effective ; aucune erreur JavaScript, aucun débordement à 390 px ; aucune mutation de compte |
| Parcours vidéo intégré | Import, worker, lecture, sous-titres, interactions et historique validés dans le navigateur avec comptes et médias de test |
| Parcours web intégré complet | Réussi : inscription, vérification d’email, OAuth, profil privé, CSRF, refresh concurrent, vidéo, MFA, récupération, export et fermeture avec TOTP récent |

Le test mobile des sous-titres ouvre désormais les réglages comme un utilisateur ; le test d’accueil accède aux parcours de connexion par l’onglet Profil, puisque l’application s’ouvre maintenant sur Accueil. Les sélecteurs du scénario web suivent les nouveaux menus et labels accessibles.

## Tailles vérifiées dans le navigateur

| Viewport | Hauteur du lecteur | Débordement horizontal | Rail d’actions |
| --- | --- | --- | --- |
| 1440 × 1000 | 870 px | Aucun | Entièrement dans le cadre |
| 1024 × 900 | 770 px | Aucun | Entièrement dans le cadre |
| 768 × 1000 | 870 px | Aucun | Entièrement dans le cadre |
| 390 × 844 | 714 px | Aucun | Entièrement dans le cadre |
| 320 × 640 | 510 px | Aucun | Entièrement dans le cadre |
| 320 × 568 | 438 px | Aucun | Entièrement dans le cadre |

Un premier contrôle a détecté le rail coupé sur le petit portrait. Le bouton d’abonnement a rejoint les options et l’espacement du rail a été réduit. Le nouveau contrôle vérifie les coordonnées des boutons, pas uniquement leur taille. Les boutons principaux font au moins 44 px.

Sur ces six tailles : lecture effective d’une mire synthétique, pause, ouverture/fermeture des commentaires par Échap, polices locales chargées, aucun message d’erreur JavaScript. États vide, erreur avec réessai et hors ligne contrôlés. Compte testé en desktop et petit écran. Le contrôle synthétique n’injecte aucune donnée dans la base du produit.

Les captures ont été inspectées : symbole ambre/orange intact, vidéo au centre, action de création visible, métadonnées et rail distincts. Le filtre d’inversion de l’ancien symbole blanc a été supprimé après vérification du logo coloré.

## Parcours de sécurité et limite préexistante

La suppression d’un compte avec MFA exige une session OTP récente. Le premier scénario complet utilisait une connexion par code de secours et a été refusé à cette étape, après suppression du profil par l’ancien BFF. Ce comportement préexistait à la refonte. Le parcours de fermeture doit être amélioré pour vérifier cette exigence avant de supprimer le profil ; cette refonte visuelle n’annonce pas ce défaut comme corrigé.

Le scénario de test a été adapté pour se reconnecter par TOTP avant la fermeture. La génération attend un compteur supérieur au dernier code consommé : réutiliser le code d’enrôlement dans la même période est correctement refusé par le serveur. Les contrôles MFA ne sont pas affaiblis pour faire passer le test.

Le scénario utilise maintenant deux bases temporaires distinctes, identité et métier, créées par le helper existant puis supprimées à la fin. Sa dernière exécution complète est réussie avec nettoyage terminé. Les premiers essais utilisant l’ancienne base d’identité partagée ne constituent pas une preuve d’isolation ; les fixtures restantes de ces essais ont été nettoyées explicitement.

## Preuves locales

- `.local/design-regard/report.json` : dimensions, polices et erreurs.
- `.local/design-regard/feed-*.png` et `account-*.png` : fixtures visuelles.
- `.local/design-regard/identity-{320,540,1440}.png` : rendu identité.
- `.local/design-regard/live-{desktop,mobile}.png` : application normale, vidéo publique existante.
- `.local/design-regard/index.android.bundle` et `android-assets` : bundle et résolution des assets natifs.
- `.local/design-review-regard-run.cjs`, `.local/design-review-regard-auth-run.cjs`, `.local/design-live.cjs` : scripts locaux ; `web/test/clients.e2e.mjs` et `feed-flow.mjs` : parcours intégré.

## Exploitation et limites

Les sorties habituelles ont été reconstruites. Les services TALA retrouvés en cours d’exécution ont été redémarrés pour charger ces sorties ; Metro existant conserve son fonctionnement. Les autres projets ne sont pas concernés.

Le rendu React Native sur un appareil n’est pas validé par les captures web. Aucun APK ni binaire iOS n’a été réinstallé. Les styles, tests et le bundle natif sont vérifiés ; un contrôle visuel Android/iOS reste nécessaire, notamment avec texte agrandi, clavier et zones sûres. Les polices natives sont encore celles du système. Mux adaptatif, réseaux dégradés et audit WCAG intégral restent hors de cette vérification visuelle.

Cette reprise ne modifie ni migration, secret, dépendance native, contrat métier ni règles d’autorisation. Les résultats historiques des tests backend API ne constituent pas une nouvelle exécution de ce lot.
