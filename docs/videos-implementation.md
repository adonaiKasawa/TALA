# Vidéos — import, traitement, Mux, publication et lecture

Lot des points 1 à 5, implémenté le 3 novembre 2026. Le traitement est séparé du serveur HTTP. Les services backend restent en NestJS/TypeScript ; les interfaces sont Next.js et React Native natif, sans Expo.

## Modes disponibles

| Réglage | Ce poste | Déploiement cible |
| --- | --- | --- |
| Transit privé | `api/.local/media`, jamais servi comme dossier statique | Volume privé partagé API/worker ; stockage S3 à ajouter pour distribuer les machines |
| File | PostgreSQL, persistante, sans Docker | Redis/BullMQ (`MEDIA_QUEUE_DRIVER=redis`) |
| Traitement | FFmpeg/ffprobe 9.0.2, processus séparé | Worker isolé, compte non privilégié, limites système CPU/RAM/disque |
| Diffusion | Locale, fichiers préparés et URLs signées | Mux, uniquement des playback IDs signés |

Docker Desktop est bloqué sur ce PC : aucune tentative supplémentaire de lancement n'est requise. Le mode PostgreSQL de développement traite les mêmes lignes persistantes et les mêmes états que le chemin BullMQ. Le chemin Redis est implémenté mais n'est pas validé avec un serveur Redis réel sur ce poste. Il n'est pas simulé en mémoire. En production, la configuration refuse le mode local/PostgreSQL, les assets de test et l'absence de HTTPS ou de secret webhook.

## 1. Import sécurisé et reprenable

L'API vérifie un access token destiné à `urn:tala:api`, un utilisateur authentifié et un profil métier. Le propriétaire provient de `iss/sub`, jamais du formulaire. Une réservation persiste avant l'envoi ; un verrou PostgreSQL par propriétaire empêche de dépasser les quotas avec des réservations concurrentes.

Limites par défaut : 512 Mio par vidéo, 2 Gio et 20 réservations sur 24 heures glissantes, cinq imports simultanés, trois minutes pour un short et une heure pour une vidéo longue. Les réservations supprimées restent comptées pendant cette fenêtre. Un contrôle d'espace libre réserve une marge avant réception/traitement.

L'envoi utilise des blocs binaires de 4 Mio maximum avec `Upload-Offset`. La réponse contient `uploadedBytes` pour reprendre. Le même fichier doit être resélectionné après interruption du client ; une réservation abandonnée expire après 24 heures. Si l'écriture disque réussit mais que la transaction échoue, le prochain bloc tronque la portion non validée avant de reprendre au dernier offset enregistré. Le worker contrôle ensuite la taille réelle, la signature du conteneur et une empreinte SHA-256.

Les identifiants de fichier sont des UUID serveur. Noms et chemins utilisateur ne deviennent jamais des chemins disque ni des commandes. Les fichiers restent hors des dossiers publics, dans une arborescence privée du service avec refus des liens symboliques et des sorties de racine. Le BFF web transmet les blocs avec le token côté serveur et protège les mutations par origine/CSRF. Le mobile lit des blocs depuis une copie privée, sans charger le fichier complet en JavaScript.

## 2. Worker et contrôle qualité

États persistants : `draft`, `uploading`, `queued`, `analyzing`, `optimizing`, `transferring`, `mux_processing`, `ready`, `published`, `failed`, `rejected`, `deleted`. L'API confirme la mise en attente en base sans attendre Redis ; le dispatcher du worker récupère les tâches toutes les cinq secondes et les transmet à BullMQ lorsque ce mode est activé. Un bail PostgreSQL de 90 secondes, renouvelé toutes les 20 secondes, empêche deux workers de traiter le même import. Les reprises après arrêt du worker repartent des données persistées ; les erreurs transitoires sont reprises trois fois avec délai. La suppression et la perte du bail interrompent le traitement.

Le worker accepte MP4/MOV et WebM/Matroska, vérifie les pistes, dimensions, cadence et durée. Il refuse les conteneurs invalides, les résolutions au-delà de 4096 pixels par côté, les cadences au-delà de 120 images/s, plusieurs pistes audio et les sous-titres intégrés dans ce premier lot. Ce refus évite leur suppression silencieuse.

Le profil SDR `h264-crf18-ssim-v1` utilise H.264 CRF 18/preset medium sans redimensionnement, sans recadrage ni réduction de cadence imposée. L'audio AAC est copié lorsqu'il est compatible. Le résultat est décodé et comparé à la source : durée/dimensions cohérentes, SSIM d'au moins 0,985 et gain de poids de 5 % pour retenir une recompression utile. Ces seuils sont des valeurs initiales, pas une preuve universelle de qualité ; un corpus représentatif reste nécessaire.

Si le gain ou la qualité est insuffisant, la source validée est conservée, avec remux sans perte pour une source MP4/H.264/AAC compatible et retrait des métadonnées globales. Les autres conversions locales doivent respecter le contrôle qualité même si elles augmentent le poids pour assurer la compatibilité de lecture. Les sources HDR/10 bits sont conservées pour Mux ; le mode local les refuse explicitement au lieu d'effectuer une conversion SDR aveugle. Une miniature JPEG est générée à la position choisie et peut être recalculée en arrière-plan.

Les processus reçoivent une liste d'arguments, sans shell ; les entrées limitent formats et protocoles à des fichiers locaux. Temps de traitement, threads, taille des sorties de diagnostic et allocations individuelles sont bornés. Le candidat encodé est plafonné à deux fois la source, avec un maximum de 1 Gio ; un résultat tronqué est refusé par le contrôle de durée. Sur VPS, compléter impérativement par l'isolation et les limites mémoire/disque du processus : `max_alloc` n'est pas une limite globale de RAM. La configuration Docker du poste n'est pas modifiée.

## 3. Mux et webhooks

Le connecteur utilise le SDK officiel `@mux/ts` 16.0.0. Il crée un Direct Upload, puis le worker envoie le fichier préparé vers l'URL HTTPS de stockage fournie par Mux ; aucun tunnel vers le stockage privé n'est nécessaire. Les URLs de transfert ne sont ni retournées aux clients ni persistées en clair. La politique de lecture demandée est toujours `signed`.

Le profil Mux demandé est `basic`, avec sa limite de résolution par défaut (1080p). La conservation de la source avant transfert ne garantit pas celle du flux final réencodé par Mux. Les offres/réglages haute résolution et la restitution HDR restent à valider avant d'annoncer une diffusion 4K/HDR.

Une tentative persistante et `passthrough` servent au rapprochement. Si une création devient incertaine après timeout, le worker recherche l'upload existant et refuse d'en créer un second à l'aveugle. L'upload ID est persisté, puis réutilisé pour les reprises. Un callback arrivé après suppression ne republie jamais la vidéo et peut reprogrammer le nettoyage de l'asset associé.

`POST /api/v1/videos/mux/webhook` vérifie le corps brut, la signature HMAC SHA-256 `Mux-Signature`, une tolérance de cinq minutes et la déduplication transactionnelle par identifiant d'événement. Les événements anciens ne rétrogradent pas une vidéo prête/publiée. Le worker interroge aussi l'état de l'upload/asset : un webhook manquant ne bloque pas indéfiniment l'encodage.

**Sur ce poste, les clés API Video lecture/écriture et la clé de signature sont configurées en privé.** Le transfert d'un clip généré en asset Mux de test, son encodage, sa lecture HLS signée et sa miniature ont été vérifiés, puis nettoyés. Les assets de test Mux sont gratuits, filigranés, limités à dix secondes et supprimés après 24 heures. Le mode local demeure activé pour tester les vidéos complètes.

La réception d'un vrai webhook Mux reste à configurer lorsque l'API aura une adresse HTTPS accessible depuis Internet. Ne pas enregistrer `localhost` comme destination Mux et ne pas ouvrir automatiquement un tunnel sur ce poste. Copier alors le vrai secret dans `MUX_WEBHOOK_SECRET`. Sans secret, l'endpoint refuse les événements ; un secret inventé ne simule pas une configuration Mux réelle.

## 4. Publication et suppression

Titre (140 caractères), description (5 000), format, visibilité et position de miniature sont modifiables. Le format court/long est choisi avant l'envoi pour préserver les limites. La publication est explicite et n'est autorisée qu'après disponibilité du média. La dépublication retire la vidéo de la consultation publique. Les états et erreurs lisibles sont affichés dans « Mes vidéos » sur web et mobile.

La suppression retire immédiatement les nouveaux accès API et programme le nettoyage des tâches/fichiers et de l'asset Mux. La fermeture du profil/compte depuis les interfaces supprime aussi les vidéos, avec confirmation explicite. La suppression directe dans l'AuthServer n'est pas encore propagée par événement : ce critère d'orchestration globale reste ouvert.

Sources, candidats et imports abandonnés sont nettoyés après expiration (24 heures). Les fichiers préparés locaux restent disponibles tant que leur vidéo existe ; chez Mux, les fichiers temporaires peuvent être retirés après disponibilité de l'asset. Après suppression et nettoyage confirmé, les métadonnées personnelles sont effacées dès que la fenêtre de quota de 24 heures est passée. Un tombstone technique empêche les résurrections par callback. Le registre de webhooks est conservé trente jours. Les sauvegardes exigent leur propre politique de rétention au déploiement.

## 5. Lecture

`GET /api/v1/videos/:id/playback` contrôle l'état, le propriétaire, la visibilité et la confidentialité du profil. Une vidéo privée ou prête mais non publiée appartient uniquement à son propriétaire ; une vidéo non répertoriée ne figure pas dans le catalogue public. Un profil privé masque ses vidéos aux autres personnes, en attendant le module d'abonnement.

La réponse contient une URL MP4 locale signée ou une URL HLS Mux signée, une miniature signée et la durée de validité. Toutes expirent après cinq minutes. Les lecteurs renouvellent l'autorisation avant expiration et conservent la position, pour permettre les vidéos longues. Une URL signée est un accès temporaire partageable : les URLs Mux déjà émises peuvent rester valides jusqu'à expiration après un changement de droits, en attendant la suppression chez le fournisseur. Elles ne remplacent pas le contrôle des nouvelles demandes de lecture.

Le serveur local prend en charge les requêtes HTTP Range. Le lecteur conserve les proportions ; shorts horizontaux et vidéos longues verticales sont autorisés. Le web utilise HTML Video et HLS.js, le mobile `react-native-video`. Le lien stable web est `/regarder/:id`. Fil vertical, recommandation, recherche sociale, commentaires et lecteur de montage appartiennent aux lots suivants.

## Endpoints

| Méthode | Route sous `/api/v1` | Usage |
| --- | --- | --- |
| GET | `/videos/options`, `/me/videos` | Limites et imports du propriétaire |
| POST | `/videos` | Réservation privée et quotas |
| GET/PATCH/DELETE | `/videos/:id` | Gestion par le propriétaire |
| PUT | `/videos/:id/content` | Bloc binaire, `Upload-Offset` |
| POST | `/videos/:id/complete` | Programmation du traitement |
| POST | `/videos/:id/publish`, `/unpublish`, `/retry` | Cycle de vie |
| GET | `/videos/public` | Dernières vidéos publiques publiées |
| GET | `/videos/:id/playback` | Droits et lecture signée |
| POST | `/videos/mux/webhook` | Événement signé, corps brut |
| GET/HEAD | `/media/:id/video`, `/media/:id/thumbnail` | Accès local avec signature temporaire |

Swagger est disponible sur l'API `/docs`. La bibliothèque liste les cent imports les plus récents ; pagination étendue et recherche restent à ajouter.

## Lancer sans Docker et sans wrappers bloqués

La configuration, la migration et les builds sont préparés sur ce poste. Arrêter les anciens services dans leurs terminaux, puis depuis la racine :

```powershell
cd "C:\Users\Mbulaa\ADONAIMBULA\projet\Vone"
node .\scripts\dev.mjs
```

Le lanceur démarre AuthServer, API, worker média, web et Mailpit. Ouvrir `http://localhost:3000/compte`, puis « Mes vidéos ». Les fichiers restent sur ce poste en mode local. `Ctrl+C` arrête les services du lanceur.

Pour reconstruire le backend sans npm.ps1 :

```powershell
cd "C:\Users\Mbulaa\ADONAIMBULA\projet\Vone\api"
node .\node_modules\@nestjs\cli\bin\nest.js build
```

Le worker seul peut être lancé par `node --env-file=.env .\dist\media-worker.js` depuis `api`. Pour une nouvelle installation Windows : `node .\scripts\setup-media.mjs` depuis la racine, puis génération Prisma, migration et reconstruction. Le téléchargement FFmpeg officiel indiqué par FFmpeg/Gyan est contrôlé par SHA-256 ; aucun script d'installation npm n'est activé.

Pour Android, conserver Metro actif avec `node .\node_modules\react-native\cli.js start --reset-cache` depuis `mobile`. Les nouveaux modules natifs imposent une reconstruction/installation. Depuis `mobile/android` :

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:4000 tcp:4000
& "$env:ANDROID_HOME\platform-tools\adb.exe" reverse tcp:4001 tcp:4001
& "$env:JAVA_HOME\bin\java.exe" -classpath ".\gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain app:installDebug "-PreactNativeArchitectures=arm64-v8a,x86_64" --no-problems-report
& "$env:ANDROID_HOME\platform-tools\adb.exe" shell am start -n com.talamobile/.MainActivity
```

Pour utiliser Mux au lieu de la lecture locale : définir `MEDIA_DRIVER=mux` dans `api/.env`, garder `MUX_TEST_ASSETS=true` pour les essais, puis relancer API et worker. Les fichiers privés `.env` et `.local/mux-signing.pem` restent exclus de Git et des images Docker. Les clés ne doivent jamais être placées dans Next public env ou le mobile. Les vidéos complètes en production demandent `MUX_TEST_ASSETS=false`, une politique de coût validée et le déploiement HTTPS/Redis/webhooks.

## Vérifications

- API vidéo : 12 tests d’intégration PostgreSQL/FFmpeg réussis, couvrant concurrence, offsets, quotas, bail expiré/tentatives bornées, miniature modifiée, vidéo longue horizontale, lecture privée/publique, HTTP Range, HMAC et suppression. Les 12 tests existants de l’API/profils restent au vert.
- Mux réel : `RUN_MUX_SMOKE=1` et `node .\test\mux-smoke.mjs` depuis `api`, uniquement hors production ; ce test génère son propre clip, crée un asset gratuit de test puis le nettoie. Ne pas exécuter automatiquement avec des fichiers personnels.
- Web : parcours navigateur avec services NestJS et worker séparé, import via formulaire, attente de traitement, lecture réelle, publication, suppression et affichage mobile.
- Android : TypeScript, lint, 5 tests Jest, bundle Metro et APK debug arm64 compilé avec Java/Gradle directement. Les essais interactifs sur téléphone et la compilation iOS sur Mac restent à effectuer.
- Redis réel, réception de webhooks depuis Internet, charge importante, corpus qualité HDR/VFR/rotation et isolation du worker de production restent à valider.

## Références

- [Mux Direct Uploads](https://www.mux.com/docs/api-reference/video/direct-uploads).
- [Signatures des webhooks](https://www.mux.com/docs/core/verify-webhook-signatures).
- [Lecture Mux sécurisée](https://www.mux.com/docs/guides/secure-video-playback).
- [Limites des assets de test](https://www.mux.com/docs/api-reference/video/assets).
- [BullMQ : connexions et reprise](https://docs.bullmq.io/guide/connections).
- [FFmpeg : protocoles](https://ffmpeg.org/ffmpeg-protocols.html).

Audit des dépendances d’exécution du 3 novembre 2026 : aucune alerte connue pour API/web ; quatre alertes faibles issues du même problème deepmerge dans les outils Community CLI mobiles, déjà suivies dans le guide des clients. Aucun `audit fix --force` ni rétrogradation du CLI n’a été appliqué.
