# ADR-002 — Prétraitement vidéo avant Mux

## Statut

Accepté pour le besoin de préparation/compression avant Mux. Les paramètres d'encodage et les économies restent à valider par mesure ; aucune implémentation n'est livrée.

## Date

20 octobre 2026.

## Contexte

Le parcours initial envoyait directement le fichier client à Mux. Le projet demande une compression préalable avec maintien de la qualité visible et optimisation des coûts de stockage.

## Décision

Remplacer l'envoi direct par une zone privée temporaire et un worker FFmpeg/ffprobe asynchrone. Analyser avant de réencoder, conserver une source déjà optimisée lorsque cela convient, contrôler le résultat puis transférer le fichier validé à Mux.

Viser une qualité perceptuelle élevée sans promettre du sans-perte. Versionner les profils et mesurer aussi l'encodage final Mux. La qualité et les coûts déterminent les profils réellement activés.

## Alternatives considérées

- Envoi direct Mux : plus simple, mais sans l'étape préalable demandée.
- Compression systématique dans l'API HTTP : bloque des requêtes et expose le site aux calculs lourds.
- Compression exclusivement côté client : dépend du terminal et ne dispense pas des contrôles serveur.
- Réencodage agressif systématique : risque de dégradation et de coût CPU sans gain de facturation Mux.

## Conséquences

Ajout d'un stockage temporaire, d'une file média, d'un worker isolé et d'un délai de publication. Le dimensionnement VPS doit être réévalué. La compression serveur réduit les transferts suivants, pas l'envoi initial du créateur.

La facturation Mux est principalement fondée sur la durée et la résolution : un fichier plus léger à durée/résolution inchangées n'assure pas un stockage Mux moins cher. Mesurer coût CPU, stockage temporaire, transferts et facture Mux avant d'annoncer une économie.

Le cycle de vie et les contrôles sont décrits dans [pipeline-video.md](../pipeline-video.md).

## Sources

- [Tarification Mux](https://www.mux.com/docs/pricing/overview).
- [Documentation FFmpeg](https://ffmpeg.org/ffmpeg-codecs.html).
