# Plan de transformation TALA

> Plan du premier lot, conservé comme historique. La reprise demandée remplace sa palette et sa composition : voir [Regard — refonte web/mobile](design-regard.md) et [système visuel actuel](design-system.md).

## Direction et contrat

« Chaque regard compte. » Le contenu vidéo est le point mémorable ; les outils restent calmes. Fond #090B0F, surface #171B22, blanc, secondaire #9299A6, menthe #A6F4D1, succès #36C98F. Accent réservé à l'action principale, au focus et à la sélection ; texte sombre sur boutons menthe pour le contraste. Hiérarchie alignée à gauche, formats vidéo conservés, aucune mosaïque de cartes fictives, aucun décor folklorique ou gradient promotionnel. Titres Plus Jakarta Sans et interface Inter si les fichiers peuvent être embarqués légalement ; fallback système explicite sinon.

Références de travail : les trois écrans réels fil, compte et identité inspectés dans le code. Leur structure fonctionnelle est conservée, mais la palette, les contrôles et la densité sont harmonisés. Le brief fourni est la référence visuelle prioritaire ; aucune interface concurrente copiée.

```
Desktop : [marque + compte / vidéos]  -> [fils et format] -> [vidéo centrée + actions]
Mobile  : [marque + connexion] -> [fils accessibles] -> [vidéo proportionnée + actions]
Compte  : [navigation] -> [titre et contexte] -> [formulaire / publications réelles]
Identité: [marque] -> [titre] -> [formulaire] -> [autres parcours]
```

## Ordre de livraison

| Priorité | Lot | Critère de sortie |
| --- | --- | --- |
| P0 / phase 1 | Audit code, routes, états et assets | `design-audit.md` avant modification |
| P0 / phase 2 | Tokens sémantiques, couleurs accessibles, type, espace, rayons, motion | `design-system.md` et fichiers de thème actifs |
| P0 / phase 3 | Boutons, champs, surfaces, feedback, marque | Aucun fond clair résiduel dans les composants modifiés ; focus et cible confortable |
| P0 / phase 4a | Fil et navigation web ; compte/profil/import par composants partagés | Lecture, contrats, actions et routes conservés ; petits écrans vérifiés |
| P0 / phase 4b | Socle et fil natifs, état courant ; identité commune | Navigateur système/CSRF inchangés ; tests natifs et compilation identité |
| P0 / phase 5 | TypeScript, lint, tests existants, rendu responsive et reduced-motion | Preuves et limites dans `design-validation.md` |
| P1 / prochain lot fonctionnel | Choix de rôle, recherche, Pour toi, filtres et demandes privées | Intégrer les contrats réellement livrés et tester les refus/états |
| P1 / prochains lots | Collections, épingles, badge, republications et social P1 | Concevoir les actions selon propriétaire et droits serveur |
| P2 / dépendances produit | Studio/analytics complets, notifications, wallet et monétisation | Attendre contrats, règles et données réelles ; aucun solde fictif |

## Gouvernance

Chaque lot reste réversible et borné ; pas de nouvelle dépendance, migration ou modification de secret. Les formulaires, permissions et transports restent existants. Ne pas ajouter de bouton sans parcours fonctionnel. Les évolutions de contrat appartiennent à un lot distinct. Une validation visuelle desktop ne valide ni appareil Android, ni iOS, ni streaming Mux réel.
