# Montage mobile en plein écran — 5 novembre 2026

Mise à jour du 6 novembre : l’entrée de création ouvre désormais la caméra, avec accès à la galerie. Le montage plein écran existe aussi sur le web — voir [caméra, navigation et profils](camera-navigation-profils.md).

Le parcours natif devient **choisir un fichier → monter en plein écran → renseigner la publication**. La référence fournie est la vidéo locale `C:\Users\Mbulaa\Downloads\1000278034.mp4` (environ 208 secondes, 720 × 1600), montrant les outils de création Instagram. TALA reprend l’organisation des outils, avec ses couleurs et ses composants.

## Outils disponibles

- Texte libre : couleur, trois tailles, fond clair/sombre ou transparent ; déplacement au doigt, modification et suppression.
- Stickers emoji statiques déplaçables, partageant la limite de huit éléments avec les textes.
- Dessin libre : six couleurs, trois épaisseurs, annulation du dernier trait et effacement ; quarante traits maximum.
- Effets de teinte chaude/froide et vignette, visibles dans l’aperçu et exportés.
- Bornes de découpe, vitesse 0,5× / 1× / 1,5× / 2×, retrait du son original et sélection de couverture.
- Retour au montage avant publication ; conservation du brouillon pendant la session de création.

Les textes, stickers, dessins et effets restent présents pendant tout le clip. Le placement temporel des éléments, les transitions entre plusieurs clips, la réalité augmentée, la musique et la voix off restent à réaliser. Le détail de l’éditeur web ajouté ensuite est décrit dans le document du 6 novembre.

## Export réel et pipeline

`ClipComposer` affiche la vidéo séparément du calque de création. Le cadre du calque suit les proportions de la vidéo, y compris pour un format horizontal. `react-native-view-shot` capture uniquement le calque transparent, avec les textes et le SVG, en PNG ; il ne capture ni les outils ni la surface vidéo Android. Les fichiers temporaires sont libérés à l’annulation et au remplacement.

Le client crée une vidéo avec `editRecipe.overlay=true`, charge la source, puis transmet le PNG via `PUT /api/v1/videos/:id/overlay` avant de terminer l’import. Le serveur contrôle le propriétaire, l’état modifiable, le type PNG, sa signature et ses dimensions. Limites : 4 Mio, dimensions de 16 à 4096 pixels, 8 388 608 pixels maximum. Le fichier reste dans le stockage temporaire privé.

La fin d’import refuse un calque manquant. Le verrou transactionnel empêche de modifier le montage une fois le traitement engagé. FFmpeg redimensionne le calque aux dimensions de la source et l’incruste dans la vidéo découpée, avec la vitesse et le son choisis. La comparaison SSIM utilise la référence montée ; le repli de qualité ne supprime pas les créations. La vidéo finale suit ensuite le transfert vers Mux existant. Swagger documente le nouvel endpoint.

Les dépendances natives ajoutées sont [react-native-svg 15.16.1](https://github.com/software-mansion/react-native-svg) et [react-native-view-shot 6.2.1](https://github.com/gre/react-native-view-shot). Les versions exactes figurent dans le verrou npm.

## Notifications mobiles

Les confirmations et erreurs courtes utilisent des notifications superposées qui disparaissent automatiquement. Un appui permet de les fermer ; afficher un nouveau message remplace le précédent et relance le délai. Les fenêtres natives de commentaires, de bibliothèque et de montage ont leur propre hôte pour garder les messages visibles. Les délais habituels sont de 3 à 6,5 secondes selon le contexte. Les informations durables de sécurité ne sont pas transformées en notifications éphémères.

## Validation et lancement

Les tests mobiles couvrent notamment l’ordre source → calque → fin d’import, l’annulation sans publication tardive et les délais des notifications. Les tests API utilisent une véritable source vidéo et un calque PNG : ils vérifient les droits, les limites, le refus d’un calque manquant, le gel après mise en file et l’incrustation dans le fichier produit.

Validation du 5 novembre : 18 tests mobiles dans six suites, 17 tests vidéo API, compilation API et compilation Android pour `arm64-v8a` et `x86_64`. Sur l’émulateur Android API 35, un clip synthétique a permis de vérifier l’ajout et le déplacement d’un texte, le dessin, les stickers, une teinte chaude et la capture PNG native. Le calque exporté conserve bien son alpha (51/255 pour la teinte à 20 %) ; son incrustation FFmpeg a été vérifiée visuellement. L’affichage puis la disparition automatique d’une notification ont également été vérifiés sur cet émulateur. Aucun compte réel ni vidéo de la base n’a été utilisé pour cette vérification. L’entrée isolée `mobile/test/native-editor-index.js` sert à cette validation et n’est pas importée par l’application normale.

Une reconstruction Android est nécessaire pour les nouvelles bibliothèques natives. Depuis `mobile\android`, en PowerShell :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
& "$env:JAVA_HOME\bin\java.exe" -classpath '.\gradle\wrapper\gradle-wrapper.jar' org.gradle.wrapper.GradleWrapperMain app:installDebug '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-problems-report
```

L’API doit également être reconstruite, puis l’API et le worker vidéo relancés pour charger le nouvel endpoint et le traitement des calques. Aucune migration supplémentaire n’est nécessaire : la recette utilise le champ JSON existant. Les validations de ce lot ne constituent pas une validation iOS ni un test de publication sur un compte réel.
