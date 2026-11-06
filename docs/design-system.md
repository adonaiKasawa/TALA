# Système visuel TALA — Regard

Référence actuelle : [direction Regard](design-regard.md), demandée le 5 novembre 2026. La palette menthe du premier lot est remplacée par les couleurs des logos officiels.

| Client | Sources actives |
| --- | --- |
| Web | `web/src/app/tokens.css`, `experience.css`, `styles.css` |
| React Native | `mobile/src/components/theme.ts`, `ui.tsx`, `feed/styles.ts` |
| AuthServer | `authserver/src/interactions/pages.ts`, `identity-brand.ts` |
| Icônes web/natif | `scripts/design-icons.mjs` et composants `Icon` |

Les alias historiques `blue`, `green`, `ink` ou `bg` restent des noms de compatibilité. `blue` pointe vers l’ambre et `green` vers la confirmation ambre ; ils ne réintroduisent pas ces anciennes couleurs.

## Palette et marque

Ambre `#FFC64B`, orange `#F5913C`, corail `#DE4B2C`. Fond `#0E1012`, surface `#191B1E`, surface élevée `#242629`, blanc et secondaire `#A4A4A8`. Les confirmations sont textuelles, accompagnées d’ambre sur fond brun ; les erreurs restent explicitement nommées et visuellement distinctes.

Le symbole officiel coloré conserve sa géométrie, son dégradé et son masque. Sur le web, aucun filtre `invert` ne doit l’altérer ; sur mobile, aucune propriété `tintColor` ne doit écraser ses couleurs.

Inter et Plus Jakarta Sans sont hébergées localement pour le web, avec leurs licences dans `web/public/fonts`. Sources : [Inter](https://github.com/rsms/inter) et [Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans). AuthServer et natif utilisent les polices système disponibles ; une famille mentionnée dans le CSS ne prouve pas son installation.

## Composants

- Navigation : rail latéral sur ordinateur, navigation basse sur mobile ; états courants annoncés aux technologies d’assistance. Créer utilise l’accent chaud et l’icône plus.
- Lecteur : image proportionnée, métadonnées superposées et rail d’actions. Position de lecture en bas, réglages secondaires repliables ; labels accessibles conservés derrière les icônes.
- Commentaires : dialogue web et modale native existants ; séparateurs calmes, fil vertical et réponses indentées.
- Compte : en-tête, avatar circulaire, navigation avec icônes, formulaires regroupés et contrôles explicites.
- Feedback : texte pour chargement, erreur et confirmation ; reprise possible ; statut hors ligne web. La couleur n’est pas le seul indicateur.
- Accessibilité : contrôles principaux d’au moins 44 px, focus visible et reduced-motion conservés. Vérifier aussi leur position : une cible de 44 px peut être coupée par son parent.

Les preuves et limites se trouvent dans [design-validation.md](design-validation.md). Les fixtures de test ne sont jamais introduites dans le produit. Les interfaces métier encore manquantes du catalogue restent à développer ; la refonte ne les coche pas artificiellement comme livrées.
