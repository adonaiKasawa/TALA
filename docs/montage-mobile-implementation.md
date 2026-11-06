# Fil et premier montage mobile — 5 novembre 2026

Le parcours de création est maintenant complété par le [montage en plein écran](montage-plein-ecran.md), avec texte, stickers, dessin et effets réellement exportés. Le présent document décrit le premier lot et les gestes du fil.

## Fil React Native

Les interactions ont des icônes pleines blanches et une ombre légère intégrée aux PNG, sans disque de fond. Le like devient coloré et le favori ambre après confirmation du serveur. Le nom, le titre et la description n’ont plus de panneau de fond ; une ombre de texte préserve leur lisibilité.

La photo du **propriétaire de la vidéo** apparaît au-dessus du like. Si aucune photo n’est définie ou si son chargement échoue, son initiale est affichée. Un petit plus permet de s’abonner ; il disparaît pour son propre compte, après abonnement ou lorsqu’une demande privée est déjà en attente. La photo ouvre le profil du créateur.

Le bouton à trois points et ses actions rapides abonnement / pas intéressé / masquer / bloquer / restreindre sont retirés du fil natif. Les API et les permissions correspondantes restent disponibles pour de futurs écrans appropriés ; aucune autorisation serveur n’est retirée.

| Geste | Résultat |
| --- | --- |
| Un appui | Pause / reprise après la fenêtre de reconnaissance des appuis multiples |
| Deux appuis | Like idempotent : ne retire jamais un like existant |
| Trois appuis | Son coupé / réactivé, conformément à la précision du porteur du projet |
| Maintien de 400 ms | Lecture 2× pendant le maintien, puis retour à 1× au relâchement |
| Défilement ou annulation | Annule les appuis en attente et restaure la vitesse |

La fenêtre entre les appuis est de 280 ms : un triple appui ne déclenche pas d’abord un like. Les boutons pause et volume superposés sont retirés. Un pictogramme de lecture apparaît uniquement à l’arrêt ; le maintien affiche un indicateur 2×. Le lecteur reste contrôlable par des actions d’accessibilité ; qualité, sous-titres et barre de position restent disponibles.

La déconnexion revient à **Accueil**, en lecture publique. L’onglet Profil présente les boutons de connexion et d’inscription au visiteur. Le bouton Retour Android revient d’abord au fil.

## Création : choisir → monter → publier

La création est séparée de la bibliothèque « Mes vidéos ». Le choix du fichier vient avant les formulaires. Un aperçu permet de fixer les bornes de l’extrait, sa vitesse, le son original et une image de couverture. Ensuite seulement viennent le titre, la légende et la visibilité.

La visibilité initiale reste **Moi uniquement**. Le créateur choisit explicitement Tout le monde ou Par lien s’il le souhaite. Le format court/long est déduit de la durée montée : court jusqu’à 180 secondes. Le fichier sélectionné reste limité à 512 Mo dans ce client.

Le bouton final réalise la réservation, l’envoi reprenable par blocs, la préparation et la publication après l’état `ready`. L’utilisateur voit une progression puis une confirmation adaptée à la visibilité choisie. Il peut revenir à Accueil ou ouvrir la gestion avancée. L’annulation conserve un brouillon serveur ; quitter l’écran arrête l’attente et ne déclenche pas une publication ultérieure depuis ce client. La copie locale de galerie est nettoyée à la sortie.

Le montage non envoyé reste en mémoire : **les brouillons locaux de montage persistants ne sont pas encore livrés**. Après fermeture de l’application, un import partiel reste dans Mes vidéos mais peut demander de sélectionner à nouveau son fichier. Le premier lot ne prétend pas livrer caméra, assemblage, recadrage, texte, effets ou musique sous licence.

## Contrat et traitement

`POST /videos` accepte une recette optionnelle `editRecipe`, stockée dans `Video.editRecipe` :

```json
{
  "start": 2,
  "end": 8,
  "speed": 2,
  "muted": true
}
```

Début et fin sont exprimés en secondes du **fichier source**. La durée résultante est `(fin - début) / vitesse`. Les vitesses autorisées sont 0,5 / 1 / 1,5 / 2 ; une fenêtre explicitement bornée conserve au moins 0,25 seconde. La miniature est exprimée dans la chronologie résultante. Les champs, les bornes et la durée source sont vérifiés côté serveur ; aucun filtre FFmpeg libre n’est accepté. La recette est immuable après réservation et ne peut pas être changée par PATCH.

FFmpeg applique `trim`, `setpts`, `fps`, et pour l’audio conservé `atrim`, `asetpts`, `atempo`. Si le son est retiré, la sortie ne contient pas de piste audio. Les dimensions sont conservées ; aucune déformation ou coupe d’image n’est ajoutée. Le worker enregistre la durée montée avant la miniature et l’envoi à Mux.

La sortie montée utilise H.264 CRF 14 et le contrôle SSIM existant à 0,985 contre la référence transformée. Si le contrôle échoue, le montage est refusé ; le worker ne remplace jamais silencieusement la vidéo montée par l’original non monté. Les imports sans recette conservent le traitement existant. L’édition HDR reste refusée explicitement dans ce premier lot ; le traitement HDR sans montage conserve son fonctionnement.

Migration : `20261105170000_video_edit_recipe`, appliquée à la base locale. Les deux vidéos existantes n’ont pas été modifiées. Le Swagger dérivé du schéma expose la recette.

## Validation

- Tests vidéo sur base temporaire : **16 réussis**, dont sorties FFmpeg réelles accélérées, ralenties, avec/sans audio ; contrôle qualité, refus des bornes hors source et recettes invalides.
- Tests mobiles : **16 réussis dans 5 suites** ; gestes séparés, like idempotent, disparition du plus après abonnement, création en trois étapes avec transmission de la recette et de la couverture, retour à Accueil après déconnexion et absence de publication après sortie de l’éditeur.
- TypeScript, lint, compilation API et génération du bundle Android réussis. Les nouveaux PNG sont résolus parmi 60 assets dans `.local/mobile-interactions`.
- Les services habituels n’ont pas été lancés ni redémarrés par ce lot. Des services ont été retrouvés relancés pendant le travail et ont été laissés tels quels ; l’utilisateur conserve leur lancement. Relancer l’API et le worker pour charger leurs nouveaux fichiers compilés. Aucune réinstallation du téléphone ni validation visuelle native n’est annoncée par ces tests de composants.
