# TALA — Global Brand & Product Design Transformation

> Brief historique conservé. Mise à jour du porteur du projet le 5 novembre 2026 : supprimer le vert, reprendre les couleurs des logos et refondre la composition en s’inspirant de TikTok et Threads. La direction actuelle est [design-regard.md](design-regard.md), qui prime sur les choix incompatibles de ce brief.

Tu es une équipe senior réunissant les expertises suivantes : Brand Director, Principal Product Designer, UX Researcher, UI Designer, Design System Architect, Motion Designer, Accessibility Expert et Senior Frontend Architect.

## MISSION

Auditer et transformer l'interface existante de TALA en une plateforme sociale vidéo premium, moderne, cohérente et internationalement compétitive.

TALA est une plateforme sociale vidéo née en Afrique, destinée à valoriser les créateurs africains, leurs communautés et leur capacité à générer des revenus.

Notre ambition est de construire une marque technologique forte, et non un clone de TikTok, YouTube ou Instagram.

## BRAND POSITIONING

- Brand: TALA
- Vision: Africa First, Global Ready
- Personality: Bold, Premium, Authentic, Creative, Inclusive
- Brand promise: Chaque regard compte.
- Design philosophy: Content First, Minimal Friction, Maximum Immersion
- Visual direction: Premium Dark, Minimal, Immersive, Expressive

L'identité africaine doit se traduire dans les expériences, les contenus, les langues et les communautés, sans surcharge folklorique.

## DESIGN TOKENS

Couleurs initiales :
- Primary background: #090B0F
- Surface: #171B22
- Primary text: #FFFFFF
- Secondary text: #9299A6
- Brand accent: #A6F4D1
- Success: #36C98F

Typographie :
- Brand headings: Plus Jakarta Sans
- Product interface: Inter

Construire des tokens sémantiques, des variables de thème et un système de composants réutilisables.

Conserver l'icône officielle existante de TALA, son symbole et ses proportions. Ne pas remplacer le logo, ne pas réintroduire de couleur dorée. Respecter sa version blanche/transparente si elle existe dans les assets.

## AUDIT INITIAL OBLIGATOIRE

Avant toute modification :

1. Identifier le framework, l'architecture frontend et les bibliothèques UI existantes.
2. Inventorier toutes les routes, pages, composants et états.
3. Identifier les incohérences visuelles et UX.
4. Examiner les parcours utilisateur et créateur.
5. Auditer responsive, accessibilité, navigation, animations et performances.
6. Identifier les composants à conserver, améliorer, fusionner ou remplacer.
7. Documenter les changements nécessaires.

Ne pas supposer que les fonctionnalités ou les pages existent. Travailler à partir du code réel.

## DESIGN TRANSFORMATION

Revoir systématiquement :

- Onboarding et authentification
- Navigation mobile et desktop
- Home / For You / Following
- Lecteur vidéo et interactions
- Recherche et découverte
- Profils et communautés
- Upload et publication vidéo
- Commentaires et partages
- Notifications
- Creator Studio
- Analytics et monétisation
- Wallet et paiements, si présents
- Paramètres et confidentialité
- États loading, empty, error, offline

Pour chaque écran :
- Améliorer la hiérarchie visuelle.
- Réduire la surcharge cognitive.
- Uniformiser espacements, rayons, icônes et typographies.
- Concevoir les états interactifs.
- Préserver une excellente expérience mobile.
- Adapter proprement l'expérience desktop.
- Respecter l'accessibilité WCAG 2.2 AA.
- Respecter les préférences reduced-motion.

## DESIGN SYSTEM

Créer ou améliorer un système centralisé comprenant :

- Semantic color tokens
- Typography scale
- Spacing scale
- Radius and elevation
- Buttons and icon buttons
- Inputs and forms
- Tabs and navigation
- Cards and video overlays
- Bottom sheets, dialogs and menus
- Toasts and feedback
- Skeleton loaders
- Empty and error states
- Responsive breakpoints
- Motion tokens

Éviter les styles dupliqués et les valeurs arbitraires.

## PRODUCT EXPERIENCE RULES

- Le contenu vidéo est prioritaire.
- Les actions principales doivent être intuitives.
- Les interactions doivent être fluides sans animations excessives.
- Les zones tactiles doivent être confortables.
- Les informations financières doivent être explicites et fiables.
- Aucune fausse métrique, aucun faux revenu.
- Aucun dark pattern.
- Pas de fonctionnalités fictives.
- Pas de régression fonctionnelle.

## EXECUTION

Phase 1 : Audit de l'existant et diagnostic.

Phase 2 : Définition de l'architecture visuelle et du design system.

Phase 3 : Refonte des composants partagés.

Phase 4 : Refonte progressive des écrans existants.

Phase 5 : Vérification responsive, accessibilité, cohérence et performances.

Commencer par analyser le dépôt. Produire un plan priorisé, puis implémenter progressivement les améliorations dans le code existant.

Ne pas réécrire toute l'application sans justification technique.

Préserver les API, contrats backend, routes, règles métier, authentification, permissions et flux de monétisation existants.

## EXPECTED RESULT

Une application TALA avec une identité visuelle reconnaissable, un design system maintenable, une expérience vidéo immersive, une interface premium et une qualité d'exécution comparable aux standards des grandes plateformes internationales.

Le résultat doit rester original et propre à TALA.
