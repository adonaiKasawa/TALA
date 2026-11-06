# Caméra, navigation et profils — 6 novembre 2026

## Parcours de création

Le bouton central « + » ouvre la caméra dans l’application Android. La première ouverture demande l’autorisation caméra et micro ; refuser le micro autorise une prise sans son. La galerie reste accessible avec le bouton situé à gauche du déclencheur, même si la caméra est refusée ou indisponible. Le bouton de droite bascule entre caméra avant et arrière. Un appui commence la prise ; un second la termine. La durée est limitée à trois minutes et la taille à 500 Mio. Passer l’application en arrière-plan annule la prise en cours.

Une prise terminée ou une vidéo choisie dans la galerie ouvre le montage en plein écran. Les effets « Soleil », « Azur » et « Cinéma » sont des teintes et une vignette : le choix reste dans le montage et dans l’export. Le mode « Normal » conserve l’image originale. Ce lot ne contient pas de masques qui suivent le visage ni de moteur de réalité augmentée comparable aux lentilles Snapchat.

Le module natif est [VisionCamera 5.2.4](https://visioncamera.margelo.com/docs), avec Nitro Modules 0.37.2 et Nitro Image 0.15.2. Il utilise le parcours de [capture vidéo et Recorder](https://visioncamera.margelo.com/docs/video-output). React Native reste natif, sans Expo. Une nouvelle installation Android est indispensable : recharger Metro seul ne charge pas les bibliothèques natives. Les autorisations iOS sont déclarées, mais la compilation et la capture iOS restent à vérifier sur macOS.

Sur le web, la création ouvre également un écran couvrant toute l’interface. `getUserMedia` fournit la caméra et `MediaRecorder` la prise vidéo ; la galerie utilise le sélecteur de fichier du navigateur. La politique de permissions autorise désormais caméra et micro pour le site lui-même. En dehors de localhost, une connexion HTTPS et les autorisations du navigateur restent nécessaires. Les paramètres de sécurité du poste continuent de s’appliquer.

Le montage web permet texte déplaçable, stickers, dessin, teintes, découpe, vitesse, son et couverture. Le PNG transparent et la recette sont transmis au même pipeline FFmpeg que sur mobile. Les métadonnées et la visibilité viennent après le montage. Sur le web, l’utilisateur confirme la publication après préparation dans « Mes vidéos ».

## Navigation et profil

La navigation principale comporte cinq destinations : **Accueil, Recherche, Créer, Messages, Profil**. « Compte » n’est plus un onglet principal. Le profil personnel présente l’avatar, la biographie, les abonnements, les abonnés et le nombre de republications. Les onglets Vidéos, Republications et Favoris affichent des miniatures avec les vues ; les favoris restent réservés au propriétaire connecté. Les éléments devenus illisibles sont filtrés côté serveur.

Le bouton « Modifier le profil » conserve le formulaire existant. « Compte » ouvre les paramètres et les entrées de sécurité ; le formulaire de mot de passe est replié tant que l’utilisateur ne le choisit pas. Les brouillons sont accessibles depuis le profil Android. La recherche interroge les vidéos, créateurs et hashtags existants ; elle ne crée pas de fil de recommandations personnalisé.

`GET /api/v1/me/library?tab=videos|reposts|favorites` fournit les compteurs et les 100 éléments les plus récents de l’onglet. Les vues sont cumulées dans `Video.viewCount`, une fois par session de lecture après deux secondes regardées, ou la durée complète pour une vidéo plus courte (minimum 250 ms). Les événements répétés et les relectures de la même session ne doublent pas le compteur. La migration initialise le total à partir des sessions encore disponibles ; les données déjà expirées ne peuvent pas être reconstituées. L’historique personnel garde sa rétention de 90 jours, indépendamment du compteur agrégé. Les lectures anonymes non suivies ne sont pas ajoutées à ce compteur.

## Première messagerie privée

Les conversations sont persistées dans PostgreSQL. Une paire de profils partage un seul fil. L’expéditeur choisit un pseudonyme, puis envoie un message texte de 1 à 2000 caractères. La boîte affiche le dernier message et les messages non lus. Les clients rafraîchissent toutes les cinq secondes ; les pages de messages contiennent au plus 50 éléments et un curseur vers les précédents.

Les routes sont authentifiées et contrôlent la participation au fil. Les blocages et restrictions empêchent lecture et nouvel envoi ; un compte privé doit être suivi avant de lui écrire. Les comptes suspendus ne sont pas disponibles. La limite d’envoi est de 20 nouveaux messages par minute et par profil ; un identifiant client rend une nouvelle tentative idempotente. La suppression du profil supprime ses conversations par les relations de la base.

Routes : `GET/POST /me/conversations`, `GET/POST /conversations/:id/messages`, `PUT /conversations/:id/read`. La passerelle web conserve le contrôle de session et CSRF. Les pièces jointes, le partage d’une vidéo, les demandes de messages avec acceptation explicite, les groupes, les notifications push et le chiffrement de bout en bout ne font pas partie de ce lot.

## Installation

Les migrations `20261106110000_direct_messages` et `20261106120000_video_views` ont été appliquées à la base locale. Reconstruire puis relancer l’API charge les routes et le compteur. Le web doit être reconstruit et relancé pour charger ses interfaces et la politique caméra. Les processus web et backend lancés par le porteur ne sont pas relancés automatiquement.

Après avoir arrêté les anciennes instances, dans un terminal pour chaque service :

```powershell
cd C:\Users\Mbulaa\ADONAIMBULA\projet\Vone\api
node node_modules/@nestjs/cli/bin/nest.js build
node --env-file-if-exists=.env dist/main.js
```

```powershell
cd C:\Users\Mbulaa\ADONAIMBULA\projet\Vone\web
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
```

Depuis `mobile\android` :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
& "$env:JAVA_HOME\bin\java.exe" -classpath '.\gradle\wrapper\gradle-wrapper.jar' org.gradle.wrapper.GradleWrapperMain app:installDebug '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-problems-report
```

## Vérifications

Bilan : 21 tests mobiles dans sept suites, 22 tests API communauté/visionnage, contrôles TypeScript et ESLint, compilation Next.js de production et APK Android pour `arm64-v8a` et `x86_64`. Les derniers ajustements de capture/import et de confidentialité/compteurs ont également passé leurs vérifications ciblées. Les serveurs de vérification ont été arrêtés et les paramètres d’affichage et de connexion de l’émulateur restaurés.

Les tests API ont validé les droits des participants, les blocages et restrictions, l’idempotence, les non lus, l’absence d’identité interne dans les réponses, les grilles privées et les vues dédupliquées. Les tests de compteur vérifient aussi qu’effacer l’historique personnel conserve le total de la vidéo.

Le test navigateur utilise une caméra synthétique pour alimenter le véritable `MediaRecorder`, puis parcourt caméra → montage → export PNG → envoi → informations de publication. L’écran de montage a été contrôlé à 320, 768 et 1440 pixels, sans débordement ni erreur JavaScript ; les grilles, les favoris privés, la recherche et le mot de passe replié ont aussi été contrôlés. L’accès à une webcam physique sur ce poste n’a pas été validé.

Sur l’émulateur Android API 35, la caméra virtuelle a enregistré un MP4 H.264 avec piste audio et arrêt automatique à 179,97 secondes. Le passage à l’éditeur a été observé, ainsi que l’import d’un clip de six secondes depuis le sélecteur Android et son passage au formulaire. Le test natif a permis de retirer un espace texte illégal dans une `View` du formulaire. La caméra est mise en pause pendant la sélection en galerie et la préparation du résultat, avant de passer au lecteur de montage. Les essais ont utilisé des fichiers synthétiques, sans connexion à un compte réel ni publication.
