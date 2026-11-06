# Validation du parcours Android — 5 novembre 2026

Parcours réalisé sur le téléphone TECNO CK7n (Android 14), connecté en USB. Application React Native de développement avec Metro, AuthServer sur le port 4000, API sur 4001 et worker média local. Aucun Docker requis.

Un compte QA dédié a été créé localement avec une adresse `example.test` et une adresse marquée vérifiée dans la fixture. La vidéo synthétique utilisée dure 12 secondes, mesure 360 × 640 pixels et contient une mire animée et une piste audio. Aucun fichier personnel n'a été téléversé.

## Résultats observés sur téléphone

| Parcours | Résultat |
| --- | --- |
| Connexion | Saisie dans le navigateur système, authentification, consentement OAuth puis retour dans TALA réussis. Le compte QA utilise le flux normal Authorization Code/PKCE. |
| Profil | Création depuis le formulaire mobile, puis accès à Mes vidéos réussi. |
| Sélection du fichier | Sélecteur Android → Parcourir → Téléchargements → fichier synthétique. Copie privée dans le cache de l'application réussie. |
| Envoi | 1 772 535 octets reçus, identiques à la taille déclarée. Le transfert est effectué par le client mobile. |
| Traitement | Passage jusqu'à `ready`, durée analysée de 12 secondes, aucune erreur. Stratégie `original-preserved-v1` : le pipeline conserve la source plutôt que de dégrader sa qualité. Il ne s'agit pas d'une preuve de réduction de taille pour ce fichier. |
| Publication | Action Publier depuis Mes vidéos, état `published` et visibilité publique confirmés. La vidéo apparaît dans Découvrir. |
| Lecture | Image animée et progression jusqu'à 10/12 secondes constatées. Fin de lecture et boucle également enregistrées dans les événements de la session QA. |
| Pause/reprise et déplacement | Position conservée à 10/12 secondes pendant la pause ; reprise et commande +10 secondes opérationnelles. |
| Son | Activation/désactivation et changement de l'état du bouton vérifiés. L'audibilité physique du haut-parleur n'est pas mesurée par ce test. |
| J'aime | Compteur à 1 et état sélectionné ; réaction enregistrée pour le compte QA. |
| Favoris | Bouton Enregistrée sélectionné ; seconde réaction enregistrée pour le compte QA. |
| Commentaires | Publication du commentaire de test depuis le formulaire et affichage de son auteur/texte réussis. |
| Défilement | Passage à la vidéo suivante, nouvelle session de visionnage et événement d'arrêt de la précédente constatés. |
| Historique | Les vidéos visionnées apparaissent ; sélection de la vidéo QA avec reprise à 1 seconde, position effectivement affichée dans le lecteur. |
| Arrière-plan | Retour à l'écran d'accueil Android : le temps regardé de la session reste inchangé entre deux lectures de contrôle. Retour dans TALA réussi. |
| Suppression et déconnexion | Suppression de la vidéo QA avec confirmation dans l'application ; état supprimé et nettoyage des fichiers par le worker constatés. Déconnexion OIDC confirmée dans le navigateur système. |

## Correction issue de cette validation

La navigation principale distribuait quatre boutons dans des colonnes de largeur égale. Sur le téléphone, les libellés se coupaient au milieu des mots et augmentaient fortement la hauteur de la barre. Elle utilise maintenant un défilement horizontal avec des boutons de largeur naturelle. Les libellés restent lisibles et la zone vidéo dispose de davantage de place. Le défilement est indépendant de celui du fil.

Fichiers concernés : `mobile/App.tsx` et `mobile/src/components/ui.tsx`.

Après cette modification : **10 tests Jest réussis**, TypeScript sans erreur et ESLint réussi sur les fichiers modifiés. Le code est chargé et exécuté par Metro sur le téléphone ; aucune nouvelle dépendance native ni réinstallation nécessaire.

Le compte QA, son profil, ses sessions, ses interactions, sa vidéo et le fichier synthétique placé dans Téléchargements ont ensuite été supprimés. Le nettoyage a ciblé uniquement l'identifiant du compte créé pour ce test ; les publications et comptes existants ont été conservés. Les services locaux et Metro restent démarrés.

## Limites et suite

Cette session valide un short MP4 local et une connexion avec un compte QA préalablement vérifié. Elle ne valide pas l'inscription avec réception d'email sur téléphone, Google/Apple, iOS, les vidéos longues, les gros fichiers multiblocs, la reprise après coupure réseau, les sous-titres sur appareil ni la sélection d'une variante HLS.

La prochaine validation porte sur Mux : ingestion, webhooks signés, lecture protégée, qualités adaptatives et connexions dégradées. Le moteur de recommandations reste reporté.

Les cases de [fonctionnalites.md](fonctionnalites.md) décrivent le périmètre implémenté. Ce compte rendu précise les scénarios effectivement vérifiés sur appareil et leurs limites.
