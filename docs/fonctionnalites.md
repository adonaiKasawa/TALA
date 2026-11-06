# TALA — Catalogue des fonctionnalités

Mise à jour : 5 novembre 2026. Statut : identité, API/profils, pipeline vidéo et visionnage/interactions disponibles en développement. Le [lot backend comptes, découverte et social](backend-comptes-decouverte-social.md) ajoute les fonctions ci-dessous sans leurs nouveaux écrans. La recommandation personnalisée est désormais implémentée côté backend ; sa validation sur un corpus réel reste distincte.

TALA est une plateforme vidéo destinée aux communautés africaines, avec un lancement envisagé en RDC, des créateurs rémunérés et des paiements Mobile Money. Le web et les applications Android/iOS utilisent les mêmes services métier. Les shorts/reels constituent l'expérience centrale ; les vidéos longues et horizontales sont également prises en compte.

Ce catalogue reprend les fonctionnalités listées dans les échanges, inspirées de TikTok, Instagram Reels et YouTube Shorts, et les exigences propres à TALA. Il ne prétend pas constituer un audit exhaustif de toutes les versions de ces plateformes.

## Lecture des priorités

- **P0** : première version exploitable et premier parcours de monétisation validé.
- **P1** : enrichissements après les premiers usages.
- **P2** : fonctions avancées demandant davantage d'infrastructure, de partenariats ou de données.

Les cases non cochées signifient « à réaliser » ou « ensemble encore incomplet ». Les cases cochées correspondent aux fonctions disponibles localement, avec leur périmètre précisé ; elles ne signifient pas que le déploiement de production est livré. Les parcours compte/profil disposent d’interfaces web et React Native ; voir [les clients et leur validation](clients-web-mobile.md). Les fonctions P1/P2 restent dans le périmètre cible même si elles sont reportées. Voir le [guide AuthServer](../authserver/VERIFICATION.md) et le [rapprochement API/profils](api-profils.md).

## 1. Comptes, authentification et profils

### P0 — Identité interne et accès

- [x] Inscription et connexion avec des comptes gérés par TALA.
- [x] Vérification de l'adresse email ; récupération et réinitialisation du mot de passe.
- [x] Déconnexion, expiration des sessions et révocation des sessions/appareils.
- [x] AuthServer OAuth 2.0/OpenID Connect interne NestJS/TypeScript avec `oidc-provider`, exécutable séparément de l'API ; aucune dépendance à Supabase Auth ni à .NET.
- [x] Parcours Authorization Code avec PKCE côté serveur, utilisable par les clients web et mobiles enregistrés.
- [x] Validation des access tokens par l'API : signature JWKS, issuer, audience API, type, expiration et scope `tala.api` ; refus des ID tokens et des tokens d'identité.
- [x] Permissions de gestion du profil contrôlées côté serveur à partir du propriétaire authentifié ; aucune identité ou attribution de rôle choisie dans le corps de la requête.
- [x] Access tokens, renouvellement contrôlé des refresh tokens et détection de leur réutilisation.
- [x] Connexion fédérée OAuth/OIDC configurable, validée avec un fournisseur de test local ; identifiants réels à fournir.
- [x] Association et dissociation des comptes externes après vérification de l'utilisateur, sans fusion automatique sur la seule adresse email.
- [x] Rôles spectateur, créateur, professionnel, modérateur et administrateur ; permissions contrôlées côté serveur — backend, choix du type de compte non administratif et contrôles de rôle/MFA sur les opérations protégées.
- [x] Protection des tentatives de connexion et journal des événements d'identité.
- [x] MFA pour les comptes administratifs et les opérations sensibles de retrait ; réauthentification selon le risque — backend : MFA récente pour l'administration et la suppression sensible ; preuve TOTP à usage unique liée au contexte du futur retrait. Le module de paiement devra consommer cette preuve avant tout mouvement financier.

### P0 — Profil et préférences

- [x] Pseudonyme unique, photo, biographie et liens — backend profil ; avatar fourni par URL HTTPS, téléversement d'image à développer avec le stockage média.
- [x] Langues, pays, centres d'intérêt et paramètres personnels — préférences privées, langue d'interface et confidentialité du profil.
- [x] Consultation des abonnés et abonnements — profils publics, 100 résultats maximum par consultation.
- [x] Onglets distincts pour shorts et vidéos longues — fil et vidéos des profils publics sur web/mobile.
- [x] Gestion et suppression du compte.
- [x] Navigation à cinq destinations : Accueil, Recherche, Créer, Messages, Profil ; paramètres accessibles depuis le profil, grilles Vidéos/Republications/Favoris avec vues cumulatives — [lot du 6 novembre](camera-navigation-profils.md).
  - [x] Création, consultation, modification et suppression idempotente du profil métier ; export des champs personnels via la consultation propriétaire.
  - [x] Interfaces web/mobile pour exporter les données actuelles et fermer le compte : vérification d’identité, suppression du profil puis du compte AuthServer ; erreur partielle signalée et reprise possible.
  - [x] Orchestration durable de suppression entre AuthServer, API et futurs contenus ; propagation des suspensions — journal transactionnel d'identité, consommation HMAC avec progression persistée, nettoyage des profils/relations/contenus et reprise après panne. Les futurs modules devront rejoindre ce mécanisme.

### P1

- [x] Compte privé et demandes d'abonnement — backend ; nouveaux écrans à intégrer ensuite.
  - [x] Confidentialité du profil appliquée par l'API : bio et liens masqués aux visiteurs si privé ; préférences toujours réservées au propriétaire.
  - [x] Demandes d'abonnement et droits associés — approbation/refus par le destinataire, annulation, retrait d'abonné, droits de lecture et blocage contrôlés côté serveur.
- [x] Vidéos épinglées et onglet des republications — backend : trois positions et liste de republications avec attribution et contrôle de visibilité.
- [x] Badge de vérification avec procédure de demande et validation — backend : demande, file privée, décision/révocation avec motif, MFA et audit.
- [x] MFA accessible à tous les utilisateurs et codes de récupération — écrans web/mobile, clé TOTP et codes à conserver.
- [x] Connexion par téléphone/OTP — backend : association vérifiée, OTP limité et à usage unique, connexion OAuth/PKCE et MFA supplémentaire si activée ; mode local chiffré et adaptateur Twilio, désactivé par défaut.
  - [ ] Activation SMS réelle et validation du fournisseur, du numéro d'émission et du budget.
- [x] Fournisseurs externes supplémentaires, dont Google/Apple — adaptateurs backend configurables, secret Apple ES256 et retour HTTPS/form_post ; association explicite conservée.
  - [ ] Configuration des comptes fournisseurs et validation réelle Google/Apple avec leurs identifiants et URI de retour.

## 2. Visionnage des shorts/reels

### P0

- [x] Fil vertical plein écran avec défilement d'une vidéo à l'autre — une vidéo dans la zone de visionnage, défilement aimanté web et paginé mobile.
- [x] Lecture automatique, pause, reprise et boucle — lecture automatique selon les autorisations du navigateur, arrêt en arrière-plan.
- [x] Activation/désactivation du son.
- [x] Barre de progression et déplacement dans la vidéo — curseur web, position tactile et commandes accessibles sur mobile.
- [x] Affichage des sous-titres disponibles — pistes WebVTT ajoutées par le propriétaire ; pas de transcription automatique.
- [x] Qualité automatique et sélection manuelle des qualités disponibles — HLS/hls.js web et Android ; HLS natif Safari/iOS automatique, MP4 local à qualité unique.
- [x] Mode économie de données — réduction des buffers et du préchargement, plafond adaptatif lorsque des variantes existent.
- [x] Préchargement limité de la prochaine vidéo et arrêt de la précédente — aucun événement de visionnage pour le seul préchargement.
- [x] Accès au profil, aux hashtags et aux informations audio depuis la vidéo — attribution du son original ; catalogue musical partagé non inclus.
- [x] Historique et reprise de navigation — historique privé et reprise explicite à la position conservée, effacement et rétention de 90 jours.
- [x] États de chargement, erreur réseau et nouvelle tentative.

Les interfaces web et React Native partagent les contrats du [lot visionnage](visionnage-implementation.md). Le parcours Android connexion → import → traitement → publication → lecture et plusieurs interactions ont été [vérifiés sur téléphone le 5 novembre 2026](validation-mobile-2026-11-05.md). Mux adaptatif, iOS et les autres cas indiqués dans ce compte rendu restent à valider ; les cases décrivent le périmètre implémenté, sans annoncer un déploiement de production.

## 3. Découverte et recommandations

### P0

- [x] Fils « Pour toi » et « Abonnements » — backend ; nouveau parcours Pour toi à intégrer aux clients.
  - [x] Fil Découvrir chronologique et fil Abonnements, sans classement personnalisé.
  - [x] Fil Pour toi personnalisé — backend : classement initial, instantanés paginés par spectateur et contrôle des droits à chaque lecture.
- [x] Découverte par thème, langue et pays — filtres backend fondés sur les métadonnées déclarées de la vidéo.
- [x] Recherche des vidéos, créateurs et hashtags — backend, résultats bornés et filtrés par droits.
- [x] Suggestions de créateurs — backend, thèmes et petits créateurs, exclusion des profils bloqués/masqués et des abonnements existants.
- [x] « Pas intéressé » et masquage d'un créateur — choix réversibles depuis Contrôles.
- [x] Classement initial basé sur intérêts, abonnements, fraîcheur et interactions — backend, goûts partagés et pénalité pour les contenus déjà vus.
- [x] Exposition de nouveaux créateurs sans réserver le fil aux comptes déjà populaires — place réservée aux petits comptes quand disponibles et diversification des auteurs.
- [x] Pagination par curseur et exclusion des contenus bloqués ou interdits au spectateur — filtrage à la requête et contrôle des nouvelles demandes de lecture.

### P1/P2

- [x] P1 : tendances, défis, recherche de sons et réinitialisation des préférences — backend : agrégats sur sept jours, défis modérés, métadonnées de sons originaux et remise à zéro de la personnalisation.
- [x] P1 : découverte sociale inspirée des republications, des amis et des goûts partagés — backend : relations suivies et co-likes, sans exposer les identités utilisées pour le rapprochement des goûts.
- [x] P1 : expérimentation de publications auprès de non-abonnés, inspirée des Reels d'essai — backend : fil d'essai, exclusion des abonnés/auteur et statistiques agrégées du propriétaire.
- [ ] P2 : modèles de recommandation avancés, évalués sur des données réelles.
  - [x] Backend de classement collaboratif et supervisé, caractéristiques enregistrées à l'impression, entraînement/évaluation chronologique, versions, activation conditionnelle avec MFA et retour arrière ; tests sur corpus synthétique.
  - [ ] Évaluation sur un corpus réel suffisant et validation de la pertinence par langue/pays avant activation réelle.

## 4. Interactions sociales

### P0

- [x] J'aime et retrait du J'aime sur une vidéo — opérations idempotentes et compteur.
- [x] Commentaires, réponses et suppression selon les droits — un niveau de réponses ; auteur du commentaire ou propriétaire de la vidéo.
- [x] Favoris et partage d'un lien public, notamment vers WhatsApp — partage système mobile, Web Share/copie et lien WhatsApp web ; domaine public à configurer avant distribution.
- [x] Abonnement/désabonnement à un créateur — profils publics ; demandes aux comptes privés en P1.
- [x] Blocage, restriction et mise en sourdine — contrôles réversibles ; restriction des commentaires sur ses propres vidéos, sans file d'approbation.
- [x] Mentions et hashtags cliquables — hashtags du titre/de la description et mentions de description dans le fil ; texte des commentaires rendu sans HTML.

### P1

- [x] J'aime sur les commentaires et commentaire épinglé — backend : idempotence, compteur et une épingle par vidéo sous contrôle du propriétaire.
- [x] Collections personnelles de favoris — backend : collections privées, renommage, déduplication et revalidation des droits.
- [x] Republication avec attribution de l'auteur — backend : source publique et onglet par profil, sans contourner confidentialité ou blocage.
- [x] Téléchargement autorisé ou refusé par le créateur — backend : refus par défaut, lien MP4 signé, préparation explicite de rendition Mux par le propriétaire.
- [x] Réponse à un commentaire par une vidéo — backend : association d'une vidéo propriétaire à un commentaire public visible et attribution sous contrôle des droits.

## 5. Création et montage

### P0

- [x] Import depuis la galerie ou un fichier local, sur mobile et web.
- [x] Sélection de miniature et brouillons de publication.
- [x] Préparation et compression contrôlée avant envoi à Mux : voir le [pipeline vidéo](pipeline-video.md).

### P1

- [x] Enregistrement avec la caméra et sélection caméra avant/arrière sur Android et web ; accès galerie depuis la caméra — voir [caméra et navigation](camera-navigation-profils.md). iOS reste à valider.
- [ ] Minuteur, compte à rebours et enregistrement en plusieurs séquences.
- [x] Découpe d’un clip : début/fin, aperçu mobile et application réelle par FFmpeg avant publication — voir [le premier montage mobile](montage-mobile-implementation.md).
- [ ] Assemblage et réorganisation de plusieurs séquences.
- [x] Vitesse d’un clip : 0,5×, 1×, 1,5× et 2× dans l’aperçu et le fichier final.
- [ ] Recadrage vertical, carré ou horizontal.
- [ ] Texte affiché à des moments précis.
- [x] Textes libres et stickers emoji statiques déplaçables ; dessins libres, couleurs, épaisseurs et annulation ; incrustation dans le fichier final — voir [le montage plein écran](montage-plein-ecran.md).
- [x] Effets simples : teinte chaude, teinte froide et vignette, dans l’aperçu et le fichier exporté.
- [ ] Transitions entre séquences et filtres avancés.
- [x] Retrait/rétablissement du son original avant publication.
- [ ] Voix off, mixage et réglage fin des volumes.
- [ ] Sous-titrage automatique avec correction manuelle.
- [ ] Miniature personnalisée, brouillons de montage et modèles.

### P2

- [ ] Effets de réalité augmentée et outils IA de création.

## 6. Sons, remixes et collaborations

### P1

- [ ] Audio original attribué à son auteur.
- [ ] Catalogue de musiques dont l'utilisation est autorisée sur TALA.
- [ ] Page regroupant les vidéos utilisant un son et réutilisation autorisée de ce son.
- [ ] Duo côte à côte.
- [ ] Remix d'un extrait, Stitch et réaction à une vidéo.
- [ ] Fond vert.
- [ ] Publication avec plusieurs collaborateurs.
- [ ] Autorisation/refus du remix par le créateur et attribution de la source.
- [ ] Défis communautaires.

### P2

- [ ] Catalogue musical étendu au moyen des accords nécessaires.

## 7. Publication et cycle de vie vidéo

### P0

- [ ] Titre, description, hashtags et mentions.
  - [x] Titre et description sur web/mobile ; hashtags et mentions structurés restent à développer.
- [ ] Langue et catégorie ; lieu facultatif.
- [ ] Choix gratuit/exclusif lorsque le parcours payant est activé.
- [ ] Choix des commentaires et paramètres de publication applicables.
- [ ] Déclaration de partenariat commercial ou de contenu généré par IA.
- [x] Suivi du téléversement et reprise après interruption.
- [x] Contrôle du propriétaire, des quotas, de la durée et de la taille autorisées.
- [ ] États explicites et modération complète.
  - [x] Brouillon, envoi, file, analyse, optimisation, transfert, encodage Mux, prêt, publié, refusé, échec et supprimé.
  - [ ] Étape de vérification/modération humaine avant publication.
- [x] Modification des métadonnées, dépublication et suppression avec propagation chez le fournisseur vidéo.
- [ ] Conservation de la durée, des dimensions et de l'orientation comme propriétés distinctes.
  - [x] Durée et dimensions d’affichage conservées ; rotation prise en compte dans le traitement.
  - [ ] Champ d’orientation source distinct et corpus de validation des matrices de rotation.

### P1

- [x] Publication privée ou non répertoriée ; autorisations appliquées à la lecture.
- [ ] Publication programmée.
- [ ] Activation/désactivation des téléchargements et remixes.

## 8. Vidéos longues et formats horizontaux

### P0

- [x] Import et lecture de vidéos longues avec le même pipeline que les shorts.
- [x] Lecteur adapté au format 16:9 et aux autres proportions, sans étirement ni recadrage imposé.
- [ ] Plein écran paysage, avance, retour et sélection de qualité.
- [ ] Vitesses de lecture et sous-titres disponibles.
- [ ] Reprise à la dernière position.

### P1

- [ ] Chapitres, playlists et liste « À regarder plus tard ».
- [ ] Création d'un short à partir d'une vidéo longue.
- [ ] Lien « Voir la vidéo complète » et attribution de la vidéo source.
- [ ] Statistiques distinctes pour shorts et vidéos longues.

Une vidéo courte peut être horizontale et une vidéo longue verticale. Le lot local limite les shorts à trois minutes et les vidéos longues à une heure ; ces valeurs restent configurables et à valider pour le lancement.

## 9. Stories, messagerie et notifications

### P0

- [ ] Notifications internes de commentaires, mentions, abonnements et événements de paiement.
- [ ] Notifications push des événements retenus pour la première version.
- [ ] Réglages des notifications et désactivation par catégorie.

### P1

- [ ] Stories temporaires et réponses aux stories.
- [x] Conversations privées individuelles, messages texte, boîte de réception et non lus, pagination, contrôle des participants et blocages — [premier lot messagerie](camera-navigation-profils.md).
- [ ] Demandes de messages avec acceptation explicite.
- [ ] Partage d'une vidéo dans une conversation.
- [ ] Conversations de groupe.
- [ ] Notifications de publications des créateurs suivis.
- [ ] Contrôles de blocage, signalement et restrictions adaptés aux mineurs.

## 10. Espace créateur

### P0

- [ ] Gestion des vidéos et brouillons.
- [ ] Vues, durée de visionnage et abonnés gagnés.
- [ ] Statut de traitement, de publication et de modération.
- [ ] Revenus estimés, validés, disponibles et versés présentés séparément.
- [ ] Historique des versements et assistance.

### P1

- [ ] Spectateurs uniques selon une méthode documentée.
- [ ] Taux de complétion et courbes de rétention.
- [ ] Abonnés gagnés par vidéo, sources de découverte et audience par pays/langue.
- [ ] Outils de modération des commentaires.
- [ ] Programmation et comparaison des performances.

## 11. Monétisation TALA et Mobile Money

### P0 — Premier parcours commercial

- [ ] Intégration d'un prestataire validé pour encaissement et versement en RDC.
- [ ] Premier produit payant et premier mécanisme de rémunération à choisir avant activation commerciale.
- [ ] Suivi des paiements demandés, en attente, confirmés, échoués et remboursés.
- [ ] Vérification des webhooks et traitement idempotent des confirmations.
- [ ] Droits d'accès aux contenus exclusifs contrôlés côté serveur.
- [ ] Règles d'éligibilité, commissions et partage des revenus explicites et versionnées.
- [ ] Journal comptable traçable des mouvements et rapprochement avec le prestataire.
- [ ] Demande de retrait, vérifications d'identité requises, validation et versement Mobile Money.
- [ ] Gestion des frais, devises, seuils et délais de disponibilité des revenus.
- [ ] Détection initiale de vues et transactions artificielles.
- [ ] Gestion des remboursements et contestations.

### P1 — Catalogue commercial cible

- [ ] Abonnement à la plateforme sans publicité.
- [ ] Abonnement à un créateur.
- [ ] Vidéos et séries exclusives.
- [ ] Pourboires et cadeaux.
- [ ] Publicités identifiées dans le fil.
- [ ] Déblocage facultatif par publicité récompensée.
- [ ] Partenariats entre marques et créateurs ; espace de campagne annonceur.
- [ ] Facturation et justificatifs adaptés aux offres retenues.

Le renouvellement automatique Mobile Money dépend du prestataire. Les parcours d'achat web et des stores mobiles doivent respecter leurs règles respectives. Aucun taux de rémunération ni revenu garanti n'est fixé par ce document.

## 12. Direct et commerce

### P2

- [ ] Diffusion en direct et chat.
- [ ] Modérateurs de direct, signalements et actions immédiates.
- [ ] Invités et coanimation à plusieurs.
- [ ] Cadeaux pendant les directs.
- [ ] Rediffusions et génération d'extraits courts.
- [ ] Produits ou services associés à une vidéo.
- [ ] Liens commerciaux et affiliation.
- [ ] Espace de collaboration avec les marques.

Le direct nécessitera un pipeline adapté aux faibles délais ; le prétraitement différé des fichiers ne lui est pas applicable.

## 13. Administration et modération

### P0

- [ ] Signalement des vidéos, commentaires et comptes.
- [ ] File de vérification, décisions, motifs, restrictions, suspensions et appels.
- [ ] Traitement des réclamations de droits d'auteur.
- [ ] Protection des mineurs et paramètres adaptés.
- [ ] Gestion des demandes de retrait et suivi des transactions.
- [ ] Journal des actions administratives et permissions par rôle.
- [ ] Export et suppression des données selon la politique applicable.
- [ ] Suivi des erreurs, performances, tâches et dépenses vidéo.
- [ ] Sauvegardes extérieures, restauration vérifiée et alertes de disponibilité.
- [ ] Gestion des quotas d'import, de stockage temporaire et de traitement.

## 14. Qualité technique et accessibilité

- [x] P0 : socle API NestJS modulaire, configuration validée, base métier PostgreSQL séparée, Prisma et migrations propres au service.
- [ ] P0 : interfaces adaptées au web mobile, à l'ordinateur et aux applications pour l’ensemble du produit.
  - [x] Parcours compte/sécurité/profil sur web responsive et React Native natif Android/iOS ; Android compilé, compilation iOS à vérifier sur Mac.
  - [x] Import, traitement, publication et lecteur sur web et React Native natif.
  - [ ] Interfaces du fil, social, créateurs et paiements.
- [ ] P0 : HTTPS, validation serveur, limitation des abus et secrets conservés côté serveur.
- [ ] P0 : navigation accessible, commandes nommées, lisibilité et sous-titres affichables.
- [ ] P0 : collecte des événements de lecture avec règles de comptage documentées.
- [ ] P0 : suivi des minutes stockées/diffusées et des coûts de compression.
- [ ] P0 : liens publics partageables et aperçu des contenus publics.
- [ ] P1 : extension des langues de l'interface selon les marchés retenus.

## 15. Hypothèses à arbitrer avant lancement

Ces points proviennent des échanges et ne sont pas des règles commerciales validées :

- Éligibilité envisagée à 100 000 abonnés et 4 000 heures ; alternative proposée : créateurs partenaires sélectionnés au lancement.
- Aperçu gratuit de 30 secondes puis publicité/paiement ; alternative proposée : catalogue gratuit et exclusivités payantes. Aucun blocage global n'est décidé.
- Abonnement envisagé autour de 5 USD/mois ; tarification finale et partage des revenus à calculer.
- Packs de tokens envisagés, dont une hypothèse à 20 USD/mois ; fonctionnement, utilité et règles à définir avant développement.
- Durée maximale d'un short et d'une vidéo longue, résolution autorisée et quotas par compte.
- Politique d'accès par pays et accès de la diaspora.
- Prestataire de paiement, devises CDF/USD, frais, vérification et conditions de versement.
- Objectif de qualité perceptuelle et profils de compression après essais sur un corpus représentatif.

## Références produit

Références consultées pendant les échanges ; leur disponibilité varie selon les comptes et les pays :

- [Création et duos TikTok](https://support.tiktok.com/en/using-tiktok/creating-videos/duets).
- [Outils et monétisation TikTok](https://support.tiktok.com/en/business-and-creator).
- [Instagram : Reels d'essai](https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/).
- [Instagram : republications et onglet Amis](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/).
- [YouTube : vidéo associée à un Short](https://support.google.com/youtube/answer/14075157).
- [YouTube : création de Shorts depuis une vidéo](https://support.google.com/youtube/answer/12836917).
