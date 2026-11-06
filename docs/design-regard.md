# TALA — Regard : refonte web et mobile

> Évolution du client natif : les interactions et le parcours de création sont désormais précisés dans [Fil et premier montage mobile](montage-mobile-implementation.md), à la suite de la demande du porteur du projet. Les commandes pause/son superposées et les options rapides du fil natif y sont remplacées.

Décision du 5 novembre 2026, demandée par le porteur du projet. Ce document remplace la direction menthe du premier lot et les choix incompatibles du brief historique. Travail repris et réalisé par l’agent principal, sans délégation.

## Identité

Les sources sont les logos existants dans `brand/tala`, pas une nouvelle interprétation de la marque. Le symbole coloré officiel remplace le symbole blanc. Aucun filtre d’inversion ni teinte native n’altère ses couleurs.

| Usage | Couleur |
| --- | --- |
| Ambre, action principale et sélection | `#FFC64B` |
| Orange, signature et création | `#F5913C` |
| Corail, détail de marque | `#DE4B2C` |
| Fond | `#0E1012` |
| Surface / surface élevée | `#191B1E` / `#242629` |
| Texte / texte secondaire | `#FFFFFF` / `#A4A4A8` |
| Confirmation | Ambre sur brun sombre, avec texte explicite |

L’accent chaud guide les actions ; il ne colore pas les surfaces de lecture. La couleur de la vidéo appartient à son contenu. Les polices locales Inter et Plus Jakarta Sans restent utilisées sur le web ; le natif utilise les polices système. Les contrastes et la lisibilité doivent aussi être vérifiés sur les vidéos réelles, pas seulement sur des aplats.

## Composition

**Web** : navigation latérale permanente, création mise en avant, choix court/long en haut, lecture verticale au centre. Sur grand écran, un panneau affiche le créateur, le titre, la description et les hashtags de la vidéo réellement active. Les commentaires s’ouvrent dans le dialogue existant, avec une ligne de conversation et des réponses indentées. Les écrans profil, publication et sécurité reprennent la même identité.

**Petit écran web** : navigation basse, symbole coloré en tête, vidéo plein cadre et rail vertical d’interactions. Le panneau latéral disparaît ; les commentaires s’ouvrent en panneau bas. Historique et préférences restent dans le menu du fil.

**React Native** : ouverture sur Accueil et navigation basse Accueil / Créer / Profil / Compte ; le fil utilise toute la zone disponible, avec métadonnées superposées, actions verticales, commandes de transport discrètes et réglages secondaires repliables. Favoris, abonnements et formats restent disponibles. L’abonnement à un créateur se trouve dans les options de sa vidéo. La connexion et l’inscription utilisent toujours le navigateur sécurisé de l’AuthServer.

**AuthServer** : symbole coloré, palette identique et composition à deux colonnes sur ordinateur ; formulaire centré sur téléphone. Méthodes POST, actions, CSRF et parcours d’authentification sont conservés.

## Comportement conservé

- Les autorisations, compteurs et commentaires viennent des services existants. Aucun nombre d’abonnés, revenu ou profil fictif n’est introduit.
- Le fil reste « Découvrir » : le classement personnalisé n’est pas ajouté par un changement de libellé.
- Lecture active, pause à l’ouverture des commentaires, préchargement et économie de données conservent leurs mécanismes existants.
- Qualité, sous-titres, position de lecture et contrôles accessibles restent présents ; les réglages secondaires sont repliables.
- Sur petit écran, le rail est raccourci pour rester entièrement dans le cadre. Les actions supplémentaires restent dans un menu.
- Les icônes du web et du natif partagent leur géométrie via `scripts/design-icons.mjs`. Aucun kit natif ni dépendance Expo n’est ajouté.

## Références de composition

L’immersion et la navigation modulaire s’inspirent des [évolutions officielles de TikTok sur ordinateur](https://newsroom.tiktok.com/new-features-bring-tiktok-magic-to-desktop?lang=en). La lecture calme, les séparateurs et les échanges s’inspirent de [l’expérience web de Threads](https://about.fb.com/news/2025/04/new-features-threads-web-experience/). L’identité, les assets et les textes restent ceux de TALA.

## Lancement et vérification

Les sorties habituelles `web/.next` et `authserver/dist` doivent être reconstruites après modification. Le lanceur `node scripts/dev.mjs` démarre ces sorties, il ne recompile pas les sources. Une modification dans une copie de prévisualisation ne suffit donc pas à changer l’application habituelle.

Le client Android en développement reçoit le JavaScript et les nouveaux PNG par Metro : depuis `mobile`, `node .\node_modules\react-native\cli.js start --reset-cache`. La génération d’un bundle Android permet de vérifier la résolution des assets sans changer la configuration native. Les preuves de validation sont dans `design-validation.md`.
