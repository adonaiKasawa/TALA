# Audit design TALA — 5 novembre 2026

## Sources et méthode

Lecture du brief `design-transformation.md`, du catalogue `fonctionnalites.md`, du contrat récent `backend-comptes-decouverte-social.md`, des guides clients, visionnage, vidéo, profils, architecture, identité et menaces, ainsi que du rapport Android historique. Inspection du code ci-dessous avant modification. Aucun AGENTS.md trouvé dans le projet. Les indications récentes du backend font autorité sur les mentions historiques de fonctions reportées. Les cases du catalogue ne prouvent pas l'existence d'un écran.

## Inventaire réel

| Surface | Sources | Écrans et états observés dans le code |
| --- | --- | --- |
| Web Next.js 16 / React 19, CSS sans bibliothèque UI | `web/src/app/layout.tsx`, `styles.css`, `components/Fields.tsx`, `ActionForm.tsx` | Thème clair bleu, typographie système, focus visible, feedback texte, responsive 767/1024 |
| `/` | `components/feed/Feed.tsx`, `FeedCard.tsx`, `FeedPlayer.tsx`, `SocialActions.tsx`, `HistoryControls.tsx` | Découvrir chronologique, Abonnements, Favoris, formats court/long, historique/contrôles ; chargement, vide, erreur et reprise ; dialogues natifs pour commentaires et communauté ; clavier et lecture arrêtée hors visibilité |
| `/compte` | `components/Account.tsx`, `ProfileForm.tsx`, `Security.tsx`, `Videos.tsx`, `SessionLists.tsx`, `Federation.tsx` | Profil/préférences, sécurité, MFA et codes de secours, connexions/applications, export/suppression ; import avec progression, traitement, publication, sous-titres et suppression ; connexion requise et erreurs |
| `/profil/[username]` | `app/profil/[username]/page.tsx`, `CreatorConnections.tsx` | Profil public/privé, liens, communauté, indisponibilité ; pas de bibliothèque de publications épinglées |
| `/regarder/[id]` | `app/regarder/[id]/page.tsx`, `WatchVideo.tsx`, `VideoPlayer.tsx` | Lecture directe, préparation, erreur et indications locales/test réelles |
| Mobile React Native 0.88, sans Expo | `mobile/App.tsx`, `src/components/ui.tsx`, `src/screens/*` | Accueil invité, fil, profil, profil public, vidéos, sécurité, MFA, sessions, connexions et données ; navigation horizontale, safe areas, clavier, retour Android et navigateur système |
| Lecteur mobile | `src/feed/styles.ts`, `FeedCard.tsx`, `FeedPlayer.tsx`, `Library.tsx`, `SocialActions.tsx` | FlatList paginée, buffers bornés, sous-titres/qualités disponibles, actions et modales ; état sélectionné accessible sur les onglets du fil |
| Identité HTML NestJS | `authserver/src/interactions/pages.ts`, `pages.controller.ts`, `interactions.controller.ts` et contrôleurs credentials | Pages partagées pour identité, consentement, inscription, récupération et vérification ; CSS local ; formulaires POST avec CSRF et actions échappées |

Le web est un BFF avec sessions privées ; le mobile emploie AppAuth, PKCE et Keychain. Aucun remplacement de ces mécanismes n'est justifié par le design.

## Écarts constatés et risques

- Palette claire/bleue et faux signe « ▶ » dans les en-têtes, sans raccord avec le brief premium sombre/menthe ni le symbole officiel.
- Styles sémantiques partiels ; nombreuses couleurs claires codées en dur dans les champs, feedbacks et lecteurs. Un changement de fond seul rendrait certains textes illisibles.
- Commandes du fil web réduites à 32 px sur petit écran ; commandes natives 36 px et textes 12 px. Les commandes agrandies consomment plus de hauteur : préserver une zone vidéo utilisable et vérifier les petits écrans.
- Minimum de hauteur web 500/560 px dans une zone fixe à 100dvh : une vidéo peut dépasser la zone visible et ne plus atteindre le seuil d'activation IntersectionObserver de 65 %. Le calcul doit rester cohérent avec le lecteur et les interactions.
- Navigation de compte mobile sans état courant, boutons de déconnexion très présents ; tous les parcours restent accessibles mais leur hiérarchie doit être clarifiée progressivement.
- Les états réseau réutilisent les erreurs du transport ; pas de bannière offline globale. Les boutons de reprise existent. Ne pas promettre une bibliothèque hors ligne.
- `globals.css` et `page.module.css` sont des restes du template, non importés par le layout actuel. Conserver hors du système actif, ne pas leur attribuer d'effet réel.
- Le profil public web reste une lecture anonyme et masque les détails d'un compte privé, même si le backend pourrait autoriser un abonné ; un futur travail fonctionnel doit intégrer le contexte authentifié.

## Fonctions absentes des interfaces

Le backend récent livre rôles, demandes privées, épingles, badges, collections, republications, interactions P1, découverte personnalisée, recherche, filtres et essais. Les clients inspectés ne les exposent pas encore. Téléphone/OTP exige un nouveau parcours et les fournisseurs réels restent conditionnels. Ne pas renommer le fil actuel « Pour toi » avant intégration de `/discover`.

Notifications, messagerie, montage/caméra, Studio analytique complet, paiements et wallet n'ont aucun écran réel ici. Aucun revenu, compteur commercial ou solde ne sera inventé. « Mes vidéos » est la gestion de publications existante, pas une preuve d'un Studio complet.

## Assets et typographie

Assets officiels dans `brand/tala/`. `tala-mark-mono.svg` fournit le symbole transparent `currentColor`, sans changement de proportions ; export PNG mono disponible. `tala-lockup-reversed.svg` contient un gradient ambre et un fond opaque : ne pas l'afficher dans le nouveau thème. Employer le signe mono en blanc et le nom existant TALA, sans redessiner le symbole. Les polices Inter et Plus Jakarta Sans ne sont pas embarquées au début de cet audit ; leur disponibilité doit être vérifiée avant d'en annoncer le rendu.

## Limites de cet audit

Inspection statique, puis validation du lot dans `design-validation.md`. Le rapport Android existant reste historique : aucune utilisation du téléphone ni certification iOS dans ce lot. Une inspection visuelle ne constitue pas une certification complète WCAG 2.2 AA.
