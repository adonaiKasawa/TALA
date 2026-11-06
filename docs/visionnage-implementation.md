# Visionnage P0 et interactions — lot du 4 novembre 2026

## Périmètre autorisé

Section 2 P0 de `fonctionnalites.md`, fil chronologique et Abonnements, événements de visionnage, interactions sociales. La recommandation personnalisée et le machine learning sont reportés.

## Livraison par étapes

- [x] Données et API : curseurs stables, éligibilité, interactions et historique.
- [x] Lecteur web : fil vertical, commandes, sous-titres et qualité disponibles, économie de données, profil/hashtags/audio.
- [x] Mobile natif : même parcours, arrêt en arrière-plan et navigation.
- [x] Mesure de lecture : impression distincte du préchargement, lecture hors pauses, déduplication et reprise.
- [x] Validation : intégration PostgreSQL isolée, parcours navigateur, contrôles mobiles, bundle et APK Android ; limites appareil/iOS ci-dessous.

## Contrat d'interface

Le fil met la vidéo au premier plan, avec commandes accessibles, attribution et actions sociales. Le web reprend la palette existante TALA ; le lecteur utilise un fond sombre, les formulaires et panneaux gardent les composants existants. Sur mobile, une vidéo occupe la zone disponible ; sur desktop, la vidéo reste centrée sans étirement. Le défilement, les flèches clavier et les commandes explicites permettent de naviguer. Les états vide, chargement, hors ligne, connexion requise et erreur disposent d'un message et d'une action.

Les abonnements concernent les profils publics dans ce lot. Les demandes d'abonnement aux comptes privés restent reportées. Aucune recommandation personnalisée ne doit être affichée comme disponible.

Les variantes de qualité et pistes de sous-titres sont proposées uniquement lorsqu'elles existent ; le fichier MP4 local reste une qualité unique. Le mode économie réduit le préchargement et plafonne les variantes adaptatives, sans promettre une réduction du poids d'un MP4 déjà encodé.

## Fil et accès

`GET /api/v1/feed` retourne des pages chronologiques de 10 vidéos par défaut, 20 maximum. Le curseur associe date de publication et identifiant et reste lié aux filtres. Les filtres disponibles sont `kind=short|long`, `mode=latest|following|saved`, `creator`, `tag` et `video` pour reprendre une vidéo précise. Aucun score personnalisé n'est calculé.

Le fil contient uniquement des vidéos publiées, publiques, attachées à un profil public. Les vidéos privées, non répertoriées, supprimées ou en préparation n'y apparaissent pas. La lecture directe d'une vidéo non répertoriée conserve les contrôles déjà livrés dans le pipeline. Une nouvelle demande de lecture authentifiée est refusée en cas de blocage réciproque. Masquer un créateur retire ses vidéos du fil sans rendre son contenu public inaccessible par un lien direct.

Les fils Abonnements et Favoris nécessitent une connexion et un profil. Les actions « Pas intéressé » masquent la vidéo dans les prochains résultats. Le panneau Contrôles permet de retirer ce choix, une mise en sourdine, un blocage ou une restriction. Les contenus et profils publics restent accessibles anonymement : un blocage entre comptes ne transforme pas leur publication en contenu privé.

## Lecteurs

Le web utilise un conteneur vertical avec défilement aimanté, commandes précédent/suivant et flèches du clavier lorsque le fil a le focus. Le mobile utilise une `FlatList` paginée avec une fenêtre limitée. Les formats longs et horizontaux conservent leurs proportions.

La vidéo active est la vidéo effectivement visible. Elle est arrêtée lors d'un changement de vidéo, de l'ouverture d'un panneau recouvrant le lecteur ou du passage de l'application/onglet en arrière-plan. Le son est désactivé initialement pour permettre la lecture automatique ; le navigateur peut exiger une action utilisateur pour démarrer. Une commande de reprise reste disponible.

Le web charge au plus les sources de la vidéo active et de la suivante ; les autres lecteurs libèrent leurs sources. Sur mobile, seuls le lecteur actif et le lecteur suivant sont montés pour le média. Aucun événement de visionnage n'est créé pour le seul préchargement. Les buffers HLS/natifs sont bornés autour de 15 secondes, réduits en économie de données ; ce ne sont pas des plafonds absolus de trafic réseau ni de mémoire.

Le mode économie désactive le préchargement suivant, limite les variantes HLS web à 480p lorsque disponibles et demande au lecteur natif un plafond de débit de 800 kbit/s. Le MP4 local ne dispose pas de variantes ; le mode ne le recompresse pas à la volée.

La sélection manuelle des qualités est disponible avec hls.js sur les navigateurs compatibles et avec les pistes exposées par Android. Le HLS natif Safari/iOS garde son choix adaptatif : `react-native-video` v6 ne fournit pas la sélection vidéo manuelle sur iOS. Les menus n'inventent pas de qualités pour un fichier unique. Les autorisations de lecture signées sont renouvelées avant expiration en conservant la position.

## Sous-titres et attribution

Le propriétaire peut ajouter/remplacer/supprimer des pistes WebVTT depuis Mes vidéos sur web ou mobile. Limites : trois langues, 20 Ko par piste et 500 blocs maximum. Les horodatages et la durée sont vérifiés ; le balisage du texte est retiré. Les pistes sont conservées en base et servies par des URLs signées de cinq minutes après autorisation de lecture. Il n'y a pas de génération automatique de sous-titres dans ce lot.

Les lecteurs proposent les pistes disponibles et leur désactivation. Le mobile sélectionne explicitement la piste choisie, indépendamment de la préférence système. La position des sous-titres est décalée pour préserver la visibilité des commandes.

Le profil du créateur, ses onglets Shorts/Vidéos longues, les hashtags du titre/de la description et les mentions de description sont accessibles depuis le fil. Le panneau audio affiche l'attribution « Son original » au créateur de la vidéo ; ce n'est pas encore un catalogue de musiques partagées ou licenciées.

## Interactions sociales

- J'aime et favoris : opérations idempotentes, état personnel et compteur de likes.
- Abonnement/désabonnement : profils publics, sans auto-abonnement ; listes publiques limitées à 100 résultats par consultation.
- Commentaires : texte de 1 000 caractères maximum, pagination chronologique de 30 éléments, réponses à un commentaire racine seulement. L'auteur du commentaire ou le propriétaire de la vidéo peut supprimer le commentaire et ses réponses. Le texte est rendu comme texte, sans interprétation HTML.
- Restriction : les commentaires d'un compte restreint sur les vidéos du compte qui le restreint sont cachés aux autres lecteurs ; leur auteur continue de les voir. Il n'y a pas de file d'approbation dans ce lot.
- Blocage : exclusions réciproques pour les accès authentifiés et suppression des abonnements réciproques. Les opérations follow/block concurrentes sont sérialisées sur la paire de profils.
- Partage : lien vers `/regarder/:id`, Web Share ou copie sur web, lien WhatsApp sur web et partage système sur mobile. En développement les liens désignent localhost ; le domaine HTTPS réel reste à renseigner avant distribution (`publicWebOrigin` du mobile).

Les écritures associées à une vidéo verrouillent sa ligne pour ne pas recréer des données après sa suppression. La suppression d'une vidéo purge réactions, commentaires, pistes et historique associé. La fermeture du profil purge aussi les relations, les interactions personnelles et les événements via les clés étrangères. Le nettoyage des fichiers et de l'asset Mux reste assuré par le worker vidéo.

## Mesures de visionnage et historique

Une impression est enregistrée lorsque la vidéo est active dans la zone visible, pour un spectateur connecté disposant d'un profil. Le préchargement n'est jamais assimilé à une impression. Le fil anonyme fonctionne sans créer de journal de visionnage utilisateur.

Chaque impression possède un UUID de corrélation, une vidéo et une surface. Les événements `play`, `progress`, `pause`, `seek`, `complete`, `replay` et `skip` sont séquencés ; les clients sérialisent leurs envois et transmettent une progression cumulative. Le temps mesuré exclut pauses, sauts et arrière-plan. Le serveur vérifie propriétaire de la session, monotonie, durée de la vidéo et budget temporel depuis la création de la session. Une répétition ou un ancien numéro de séquence n'ajoute pas d'événement.

Les tables `WatchSession` et `WatchEvent` conservent la synthèse et le journal. Une session d'exposition est limitée à 24 heures. L'historique retourne au maximum 50 vidéos distinctes parmi les 200 dernières sessions encore accessibles, avec leur position pour une reprise explicite. La conservation est de 90 jours, avec purge horaire tant que l'API tourne ; l'effacement utilisateur supprime aussi le journal d'événements.

Ces mesures proviennent du client et restent falsifiables malgré leurs bornes. Elles servent à l'expérience de lecture et à une future analyse, **pas à certifier des vues ou calculer une rémunération**. La lutte antifraude, les compteurs financiers et l'entraînement de modèles sont hors de ce lot.

## Contrats et stockage

Les nouveaux modèles sont `VideoReaction`, `CreatorRelation`, `VideoComment`, `WatchSession`, `WatchEvent` et `VideoCaption`. Les vidéos portent aussi les hashtags normalisés. Les migrations additives `202611040001_feed_social` et `202611040002_watch_events` sont appliquées à la base locale ; aucune réinitialisation n'a été effectuée.

| Route API | Usage |
| --- | --- |
| `GET /feed` | Fil chronologique filtré et paginé |
| `GET /videos/:id/social` | Compteur et état personnel |
| `PUT/DELETE /videos/:id/reactions/:kind` | `like`, `save`, `not_interested` |
| `PUT/DELETE /creators/:username/relations/:kind` | `follow`, `block`, `mute`, `restrict` |
| `GET /creators/:username/followers` ou `/following` | Profils publics liés |
| `GET/POST /videos/:id/comments` | Consulter/commenter/répondre |
| `DELETE /videos/:id/comments/:commentId` | Suppression selon les droits |
| `POST /watch/impressions` | Exposition idempotente |
| `PUT /watch/:id` | Événement séquencé cumulatif |
| `GET/DELETE /me/history` | Historique et effacement |
| `GET /me/creator-controls` | Contrôles réversibles |
| `PUT/DELETE /videos/:id/captions/:language` | Pistes du propriétaire |
| `GET /videos/:id/captions/:language` | Lecture par signature |

Les chemins sont préfixés par `/api/v1`. Les mutations nécessitent les tokens API existants. Le web utilise un BFF à routes autorisées, session privée et protection Origin/CSRF ; aucun token n'est envoyé au navigateur. Les événements disposent d'une limite séparée de 240 requêtes/minute/IP, sans augmenter la limite des autres mutations. Les contrats sont ajoutés au Swagger de l'API.

## Lancement local

Arrêter l'ancien lanceur dans son terminal, puis depuis la racine :

```powershell
node .\scripts\dev.mjs
```

Ouvrir `http://localhost:3000/`. Publier une vidéo avec visibilité publique et profil public pour la voir dans Découvrir. Mes vidéos reste accessible depuis Mon compte. Aucun Docker ni nouveau service externe n'est requis pour ce lot.

Pour Android, conserver Metro actif depuis `mobile` :

```powershell
node .\node_modules\react-native\cli.js start --reset-cache
```

Puis depuis `mobile/android` :

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:3000 tcp:3000
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:4000 tcp:4000
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:4001 tcp:4001
& "$env:JAVA_HOME\bin\java.exe" -classpath ".\gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain app:installDebug "-PreactNativeArchitectures=arm64-v8a,x86_64" --no-problems-report
```

## Validation et limites

- API communauté : 9 tests d'intégration PostgreSQL réussis, y compris idempotence, curseurs, confidentialité, restriction, journal et suppression concurrente.
- Mesure de lecture : 4 tests réussis exécutant les implémentations web/mobile avec une horloge contrôlée.
- Mobile : 10 tests Jest réussis ; contrôles TypeScript et lint effectués. Le [parcours Android complet du 5 novembre 2026](validation-mobile-2026-11-05.md) valide connexion, profil, import, traitement, publication, lecture et interactions avec un compte QA. Les limites de cette session, Mux adaptatif et iOS nécessitent encore une validation dédiée.
- Non-régression API et vidéo : 37 tests réussis au total (12 API/profils, 12 pipeline vidéo, 9 communauté, 4 mesure de lecture).
- Navigateur : parcours complet réussi avec AuthServer, API et worker séparés : import, fil, lecture réelle, sous-titres effectivement chargés, pause/reprise, son, likes, favoris, commentaires, défilement, arrêt du lecteur précédent, historique et sécurité du compte. Absence d'erreurs JavaScript et de violations CSP ; contrôles de largeur à 320, 390, 768, 1024 et 1440 pixels.
- Android : bundle Metro généré et APK debug arm64 compilé avec Java 17/Gradle, sans scripts shell bloqués. L'APK debug utilise Metro ; il n'a pas été installé sur le téléphone dans ce lot.
- Mux adaptatif, langues multiples et connexions dégradées nécessitent un corpus et des appareils représentatifs. Les limites de production du [pipeline vidéo](videos-implementation.md) restent applicables.

Références des API de lecture : [hls.js](https://hlsjs.video-dev.org/api-docs/hls.js.hls), [react-native-video v6](https://docs.thewidlarzgroup.com/react-native-video/docs/v6/component/props/). La [conversation sur les recommandations](recommandations-video-conversation.md) reste une référence future ; aucune de ses phases ML n'est activée ici.

### Correctif Android : lecture bloquée à zéro (4 novembre 2026)

Le téléphone chargeait la première image et la durée, mais le fil conservait l'index actif à `-1` : le lecteur recevait donc `paused=true`. Le chargement d'une nouvelle page sélectionne maintenant son premier élément lorsqu'elle est non vide et revient en haut du fil. Cela couvre aussi l'actualisation avec des éléments identiques, où FlatList peut ne pas réémettre son événement de visibilité. Le test vérifie le démarrage, le passage à la vidéo suivante et l'actualisation.

La configuration du buffer définit explicitement ses quatre seuils : minimum 5 secondes (3 en économie), maximum 15 secondes (5 en économie), démarrage 1 seconde et reprise après buffering 2 secondes. L'ancien minimum de 1,5 seconde était incompatible avec le seuil de reprise par défaut de Media3 1.8.0. Les deux modes sont couverts par des tests.

Après rechargement de Metro, lecture constatée sur le TECNO CK7n : compteur à `7 / 20 s`, image en mouvement. Aucun effacement de données ni réinstallation n'a été nécessaire. Cette vérification concerne le MP4 local ; elle ne valide pas à elle seule le streaming adaptatif Mux.

### Isolation des tests

Les suites utilisent désormais une base PostgreSQL locale temporaire `tala_test_<identifiant aléatoire>`, migrée avant les essais et supprimée ensuite. Cela empêche le worker de développement déjà lancé de réclamer une vidéo de test dont les fichiers sont dans un autre dossier. Aucun service utilisateur n'est arrêté pour ces essais. Le compte PostgreSQL de test doit pouvoir créer une base locale ; le helper refuse un hôte distant et un environnement de production.

Depuis `api`, après compilation des services :

```powershell
node ..\scripts\test-api.mjs
```

Pour ne lancer que le nouveau lot : `node ..\scripts\test-api.mjs feed watch-tracker`. Le parcours navigateur reste lancé par `node .\test\clients.e2e.mjs` depuis `web`, avec initialisation des tables de session dans sa propre base temporaire. Les fixtures AuthServer sont temporaires et les emails sont conservés localement, sans remise externe.
