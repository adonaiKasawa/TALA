# Backend comptes, découverte et interactions — 5 novembre 2026

Ce lot porte sur les sections 1, 3 et 4 du catalogue. Les services restent deux applications NestJS séparées. Les nouveaux écrans web/mobile sont à réaliser ensuite ; aucun fournisseur SMS ou OAuth payant n'est activé par ces changements.

## Identité et rôles

Les rôles canoniques sont `viewer` (spectateur), `creator`, `professional`, `moderator` et `admin`. Les nouveaux comptes commencent comme spectateurs. `POST /account/type` permet de choisir seulement les trois premiers rôles et impose ensuite une reconnexion. Un client ne peut pas se donner un rôle administratif. La migration convertit l'ancien rôle `user` en `creator` pour préserver le droit de publication des comptes existants.

L'API réserve l'import aux créateurs, professionnels et rôles administratifs. Les routes de vérification de badge et de défis exigent modérateur/administrateur ; la gestion des modèles exige administrateur. Ces opérations administratives exigent aussi une authentification TOTP datant de moins de cinq minutes. Un compte administratif ne peut pas désactiver sa MFA sans avoir quitté ce rôle. L'administration des identités conserve également ses restrictions de scope, d'audience et de client OAuth.

Les access tokens contiennent le rôle, `amr` et `auth_time`. Avec la synchronisation configurée, l'API relit également le statut du compte, le rôle et l'existence de sa session/autorisation auprès de l'AuthServer. Une suspension ou révocation n'attend donc pas l'expiration du JWT pour refuser les nouvelles requêtes authentifiées. En cas de panne du service d'identité, ces requêtes échouent sans autoriser l'accès.

### MFA des futurs retraits

`POST /account/step-up` reçoit le mot de passe actuel (compte local), un code TOTP, `purpose: withdrawal` et un `contextHash` SHA-256 de 64 caractères hexadécimaux. Le hash doit identifier les paramètres immuables de l'opération, notamment montant, devise et destination, selon une représentation canonique commune au futur service financier.

La réponse contient une preuve opaque valable 120 secondes. Sa consommation serveur est atomique, liée au sujet et au contexte exact ; elle échoue après révocation de la session, réutilisation ou expiration. `IdentitySyncService.consumeWithdrawalProof` est le point d'intégration de l'API. Les codes de secours ne remplacent pas le TOTP pour cette opération. Aucun retrait ni mouvement d'argent n'est créé dans ce lot : le module financier devra vérifier ses propres droits métier, calculer le contexte et consommer cette preuve avant son opération idempotente.

## Suppression et suspension durables

Les transactions de l'AuthServer écrivent un événement `IdentityEvent` avec le changement de statut, de rôle ou la suppression de l'utilisateur. Un verrou transactionnel commun ordonne l'allocation et la validation des numéros d'événements, afin qu'un consommateur ne saute pas un événement encore non validé.

L'API consulte ce journal toutes les deux secondes par un canal HMAC-SHA256. Chaque message est appliqué avec sa progression dans une seule transaction. Les redémarrages et répétitions sont sans effet supplémentaire ; une panne conserve le journal et le dernier numéro appliqué. Les suppressions retirent le profil et ses données sociales, marquent les vidéos à supprimer et laissent le worker existant nettoyer les fichiers ou Mux. L'attribution des sons du compte supprimé est anonymisée. Les suspensions masquent le profil et ses vidéos sans effacer leur contenu. Les futurs modules possédant des données de compte doivent rejoindre cette transaction ou ajouter leur propre progression durable avant de supprimer des données dans un autre service.

Les endpoints internes sont `/internal/identity-events`, `/internal/identity-state/:id` et `/internal/step-up/consume`. La signature porte sur `méthode + saut de ligne + chemin et query + saut de ligne + timestamp millisecondes + saut de ligne + JSON.stringify(body || {})`. Les en-têtes sont `X-Tala-Time` et `X-Tala-Signature`. La fenêtre de temps est de 60 secondes. Ce canal utilise une clé différente des clés de signature OAuth et Mux. Les liens média déjà émis gardent leur courte durée de validité ; cette réplication ne rappelle pas un fichier déjà téléchargé.

## Comptes privés, profils et badges

| Route API (préfixe `/api/v1`) | Fonction |
| --- | --- |
| `PUT /creators/:username/relations/follow` | Abonnement public immédiat ou demande privée, réponse `pending` pour une demande. Répéter l'action ne crée pas de doublon. |
| `DELETE /creators/:username/relations/follow` | Annuler sa demande ou son abonnement. |
| `GET /me/follow-requests` | Demandes reçues, sans accès au compte d'un autre utilisateur. |
| `PUT /me/follow-requests/:profileId` | Décision `{ accept: boolean }` du destinataire de la demande. |
| `DELETE /me/followers/:profileId` | Retirer un abonné et ses droits. |
| `PUT /videos/:id/pin` | Position 1, 2 ou 3 ; `rank: null` retire l'épingle. Réservé au propriétaire, vidéo publiée requise. |
| `GET /profiles/:username/pinned` | Épingles visibles selon le profil et les droits du spectateur. |
| `GET /me/verification`, `POST /me/verification` | État et soumission d'une demande de badge avec motif et jusqu'à trois liens HTTPS facultatifs. Aucun téléchargement automatique de ces liens. |
| `GET /moderation/verifications`, `PUT /moderation/verifications/:id` | File privée et décision `{ approved, reason }`, avec MFA et journal d'audit. |
| `DELETE /moderation/profiles/:id/verification` | Révocation motivée du badge. |

Un abonnement accepté ouvre la lecture et les détails du profil privé ; une demande en attente ne donne aucun droit. Retrait, désabonnement et blocage retirent l'accès aux nouvelles demandes de lecture. La lecture directe, les fils, la recherche, les collections et les republications recontrôlent les droits. `verified` est exposé dans le profil public.

## Téléphone et fournisseurs externes

L'association d'un téléphone exige une réauthentification, puis un OTP envoyé au numéro E.164 vérifié. Les codes expirent après cinq minutes, sont à usage unique et limités à cinq tentatives. Le stockage des SMS locaux est chiffré ; le code de vérification est protégé par HMAC. Les demandes sont limitées par IP et numéro. Un challenge de connexion est lié à son interaction OAuth et ne peut pas servir à associer un téléphone ou à une autre interaction.

Routes AuthServer : `POST /account/phone/challenge`, `PUT /account/phone`, `DELETE /account/phone`, `POST /interaction/:uid/phone/challenge`, `POST /interaction/:uid/phone/login`. La connexion produit ensuite un code OAuth échangé avec PKCE, puis des tokens portant `amr: sms`, complété de `otp` si la MFA du compte est activée. Elle concerne un numéro associé à un compte existant et vérifié ; aucune fusion automatique de comptes n'est faite par numéro.

- `SMS_DRIVER=disabled` par défaut : aucun envoi.
- `SMS_DRIVER=local` : tests/développement uniquement, contenu chiffré dans `PhoneChallenge.delivery`, aucun SMS externe. Ce mode est refusé en production.
- `SMS_DRIVER=twilio` : nécessite `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. L'échec d'envoi invalide le challenge. L'activation et le budget restent à décider avec le fournisseur.

Google utilise `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Apple utilise `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` et `APPLE_PRIVATE_KEY_PATH` (clé P8 privée). Apple emploie un secret client ES256 de courte durée et un retour `form_post` qui exige HTTPS. Les URI de retour à enregistrer sont `/federation/google/callback` et `/federation/apple/callback` sur le domaine de l'AuthServer. La validation du nonce, de l'issuer et de l'audience ainsi que l'association explicite restent dans le service de fédération existant.

Les adaptateurs sont implémentés et les chemins locaux testés. La création des projets chez les fournisseurs, leurs identifiants, l'activation SMS et les essais Google/Apple réels ne sont pas validés par ces tests.

## Découverte et recommandations

`GET /feed` garde ses modes chronologiques et ajoute `category`, `language` et `country` aux filtres existants. Le pays provient des métadonnées de la vidéo, pas des préférences privées de son auteur. Les créations/modifications vidéo acceptent ces métadonnées et `allowDownload`/`trial`. Une modification partielle conserve tous les champs non fournis ; les valeurs par défaut s'appliquent uniquement à la création.

`GET /search?q=...` retourne vidéos, créateurs, hashtags et sons accessibles. Les résultats sont bornés : 30 par type ; les suggestions examinent au maximum 200 profils et renvoient 20 créateurs. `GET /me/creator-suggestions` privilégie les thèmes déclarés et les petits comptes en excluant ses abonnements et les créateurs masqués/bloqués.

`GET /discover` propose `mode=foryou|social|trial`, les formats et filtres par thème, langue, pays, hashtag, son et défi. Le classement utilise intérêts, langue, pays, abonnements, fraîcheur, goûts partagés, republications et contenus déjà vus. Les rapprochements de goûts utilisent au moins deux vidéos aimées en commun et ne renvoient pas les identités de ces spectateurs. Une place sur cinq est réservée aux petits créateurs lorsqu'ils sont disponibles, avec diversification par auteur sur les blocs de dix résultats ; le repli remplit le fil lorsque le catalogue est peu varié.

Les candidats sont bornés aux 500 publications éligibles les plus récentes. Un instantané garde au maximum 150 identifiants pendant 15 minutes et dix instantanés par profil. Le curseur appartient au spectateur et aux filtres utilisés ; les droits sont recontrôlés après création de l'instantané. Ce périmètre est adapté au développement initial, sans prétendre être un index distribué de l'intégralité du catalogue.

`POST /me/discovery/reset` remet à zéro les intérêts, les exclusions « Pas intéressé » et les instantanés ; abonnements, favoris et historique restent conservés. Les nouveaux calculs de personnalisation ignorent le visionnage antérieur à la remise à zéro.

`GET /discover/trends` agrège les publications des sept derniers jours et les spectateurs distincts ayant regardé au moins deux secondes. `GET /discover/challenges` liste les défis actifs ; `POST /moderation/challenges` les crée après contrôle du rôle et de la MFA. `POST /videos/:id/sound` déclare un son original et ses autorisations ; `PUT /videos/:id/discovery-links` associe un son autorisé et/ou un défi actif.

Les vidéos marquées `trial` sont proposées dans le fil d'essai uniquement aux non-abonnés, avec exclusion de leur propre auteur. Elles sont exclues du fil général chronologique. `GET /videos/:id/trial-results` donne au propriétaire des statistiques agrégées de visionnage et de complétion. Le propriétaire termine l'essai en modifiant `trial` à `false`. Il s'agit d'un parcours d'essai, pas d'une preuve statistique d'efficacité commerciale.

### Apprentissage et évaluation

Les impressions enregistrent côté serveur sept caractéristiques au moment du visionnage, avant de connaître son résultat. Un second étage peut apprendre une régression logistique régularisée sur ces observations. Les co-likes et les relations sociales constituent le premier étage collaboratif. Les poids, mesures et versions sont persistés.

Routes administratives : `GET /admin/recommendation-models`, `POST /admin/recommendation-models/train`, `PUT /admin/recommendation-models/:id/active`, `DELETE /admin/recommendation-models/active`. Un entraînement exige au moins 200 couples spectateur/vidéo distincts avec caractéristiques et labels utilisables, 20 spectateurs et 5 vidéos. Les observations trop récentes et les résultats intermédiaires ambigus sont exclus. La séparation chronologique utilise 80 % des observations pour l'apprentissage et 20 % pour l'évaluation, avec au moins dix exemples de chaque classe dans chaque partie.

Un modèle reste inactif à sa création. Son activation exige un gain de log-loss d'au moins 0,01 contre la référence constante calculée sur l'ensemble d'apprentissage, puis une décision administrative avec MFA. Le retour au classement heuristique est disponible. Les tests synthétiques vérifient calcul, refus d'un corpus insuffisant, évaluation, activation et désactivation. **La case P2 « évalués sur des données réelles » reste ouverte** : les observations réelles et la validation de qualité par langue/pays ne peuvent pas être remplacées par ces fixtures.

## Interactions P1

Les routes `PUT/DELETE /comments/:id/like` et `PUT/DELETE /comments/:id/pin` sont idempotentes. Une seule épingle de commentaire est autorisée par vidéo et seul son propriétaire la gère. Les listes de commentaires exposent `liked`, `likes`, `pinned` et les réponses vidéo visibles. Les vidéos publiques peuvent être associées à un commentaire visible via `PUT /comments/:id/video-reply` ; `GET /videos/:id/reply-context` recontrôle les droits avant de retourner son attribution. Les sources privées sont refusées pour éviter une republication de leur contexte.

`/me/collections` et `/me/collections/:id` fournissent création, liste, consultation, renommage et suppression privés. `PUT/DELETE /me/collections/:id/videos/:videoId` gère les éléments, avec déduplication sous verrou. Les collections sont limitées à 50 et à 500 vidéos chacune ; leurs lectures éliminent les vidéos devenues inaccessibles.

`PUT/DELETE /videos/:id/repost` et `GET /profiles/:username/reposts` conservent l'auteur de la vidéo comme source. Une vidéo privée ou un profil privé ne peut pas être republié. Le retrait de sa republication reste possible si la source devient inaccessible.

Le téléchargement est refusé par défaut. Après `allowDownload: true`, `GET /videos/:id/download` émet un lien MP4 de cinq minutes sous contrôle des droits. Pour Mux, le propriétaire déclenche explicitement `POST /videos/:id/download/prepare` ; le backend demande une rendition statique et refuse le lien tant qu'elle n'est pas prête. Les renditions ont un coût de stockage supplémentaire chez Mux ; leur création n'est donc pas déclenchée par une simple consultation anonyme. La désactivation empêche les nouveaux liens, avec la même limite d'expiration pour ceux déjà émis.

## Préparation et vérification

Les migrations sont additives. Elles ne réinitialisent aucune base : `202611050001_identity_lifecycle` côté identité et `202611050001_community` côté API. La clé de synchronisation est obligatoire en production. Depuis la racine, `node scripts/setup-identity-sync.mjs` configure une clé commune dans les deux `.env` locaux sans l'afficher. Puis lancer les migrations et redémarrer les services. Les exemples de configuration ne contiennent aucun secret réel.

Tests : `node scripts/test-api.mjs` et `node scripts/test-auth.mjs`, avec Node 24 LTS. Les lanceurs créent, migrent et suppriment leurs propres bases temporaires ; la suite API/profils possède également une base AuthServer isolée. Les tests ne déclenchent aucun appel SMS réel ni création d'asset Mux réelle. Swagger API et AuthServer documentent les nouveaux contrats.

Validation finale du 5 novembre : **53 tests API réussis** (profils, communauté, classement, pipeline FFmpeg et suivi de lecture), **26 tests AuthServer réussis**, compilations des deux services et ESLint des fichiers concernés réussis. Le test de contention reproduisait une expiration Prisma `P2028` au-delà de cinq secondes d'attente du verrou d'import ; la transaction de création dispose maintenant d'une attente bornée adaptée, tout en conservant le verrou et la limite de cinq imports actifs. Le test tient le verrou six secondes pour vérifier cette non-régression.

Les deux migrations sont appliquées sur les bases locales. Une clé HMAC commune est configurée dans les fichiers privés, sans être affichée. Après redémarrage, les contrôles de santé et de recherche répondent en HTTP 200 ; Swagger expose les nouveaux contrats et le consommateur d'identité a rattrapé le journal initial. La migration initialise les événements des comptes déjà présents, notamment leur statut de suspension.

Références techniques consultées : [renditions statiques Mux](https://www.mux.com/docs/guides/enable-static-mp4-renditions), [envoi de messages Twilio](https://www.twilio.com/docs/messaging/api/message-resource), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi).

## Interfaces à réaliser ensuite

Choix du type de compte, demandes d'abonnement, gestion des abonnés, épingles, collections, republications, likes/épingle/réponses vidéo des commentaires, autorisation de téléchargement, formulaire de badge et console de modération, recherche et filtres, Pour toi/social/essais, statistiques d'essai, réinitialisation de la personnalisation, association du téléphone et connexion OTP. Les boutons Google/Apple sont affichés uniquement lorsque le serveur annonce un fournisseur configuré.
