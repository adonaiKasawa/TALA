# Recommandations vidéo — conversation de référence pour TALA

Date de récupération : **4 novembre 2026**.

- [Réponse partagée accessible](https://chatgpt.com/s/t_6aeae091d7748191a2e4528cedad621d).
- [Conversation initiale et question utilisateur](https://chatgpt.com/share/6aeade1b-3980-83ea-b779-f1c589a9bb16).
- Titre : « Comment fonctionnent réellement les algorithmes de recommandation de TikTok, YouTube, Instagram et Facebook ? »
- Sous-titre de la source : « Analyse technique approfondie — novembre 2026 ».

## Statut et utilisation

Ce document est une **restitution structurée de la conversation**, destinée à préparer le futur moteur de recommandation de TALA. Les explications sont reformulées en Markdown ; les exemples de données, le pseudocode, les formules et la configuration pédagogique sont conservés. Les illustrations et le simulateur interactif sont retranscrits sous forme de texte et de tableaux.

Les références sont celles fournies dans la conversation ; elles n'ont pas fait l'objet d'une nouvelle vérification indépendante lors de cet archivage. Les affirmations datées et les résultats concernant les plateformes restent attribués à cette source et seront à vérifier avant de servir de base à une décision technique.

Les technologies et valeurs proposées sont des pistes de conception. Elles ne remplacent pas les décisions actuelles de TALA : backend NestJS, PostgreSQL, worker FFmpeg et diffusion Mux. Aucune fonctionnalité de recommandation n'est implémentée ou cochée du seul fait de cette archive.

## Question utilisateur

> comment fonctionne la recommandation de video sur tiktok ou facebook youtube ou instagrame
> comment l'algorithme fonctionne derriere
>
> donne moi tout le detail 100% sans laisser un paramettre au hazard

## Introduction : limite de connaissance

Un moteur cherche quels contenus proposer à une personne, à un instant donné, parmi un vaste catalogue. Il combine collecte d'événements, compréhension des contenus, représentations vectorielles, recherche de candidats, prédictions, classement, exploration, éligibilité et apprentissage.

Les familles de signaux et plusieurs architectures sont publiques. Les poids exacts, tous les hyperparamètres, les règles de production et le code complet des plateformes sont propriétaires et évoluent. La conversation ne prétend donc pas révéler « 100 % » de leurs secrets internes ; elle distingue mécanismes documentés et exemples d'ingénierie.

## 1. Fonctionnement global

```text
Actions utilisateur : ouverture, visionnage, abandon, like, partage…
    ↓
Collecte et traitement des signaux
    ↓
Recherche de vidéos candidates — retrieval
    ↓
Filtres : sécurité, disponibilité, restrictions et confidentialité
    ↓
Classement — prédictions et scoring
    ↓
Réorganisation, diversification et exploration
    ↓
Feed personnalisé
    ↓
Nouveaux événements pour les recommandations suivantes
```

La source rapproche ce pipeline des publications de Meta et de l'architecture historique de YouTube : génération de candidats, puis classement. Les filtres peuvent intervenir à plusieurs étapes.

## 2. Différences entre plateformes

| Plateforme | Orientation générale | Signaux cités |
| --- | --- | --- |
| TikTok | Découverte et adaptation rapide | Visionnage, complétion, abandon, partage, intérêts |
| YouTube | Pertinence et satisfaction | Historique, clics, watch time, enquêtes |
| Instagram | Intérêts, découverte et relations | Visionnage, interactions, affinités entre comptes |
| Facebook | Intérêts et dimension sociale | Historique, engagement, relations, satisfaction déclarée |

Ces orientations ne sont pas des frontières strictes. Feed, Reels, Shorts, Explore, Stories, recherche et suggestions de comptes ont des systèmes distincts.

La conversation cite **User True Interest Survey — UTIS**, présenté par Meta pour Facebook Reels en janvier 2026, visant à identifier l'intérêt réel au-delà du temps passé et des likes. Résultats attribués à Meta en section 14.

## 3. Comprendre les comportements utilisateur

### 3.1 Signaux explicites et implicites

| Signal illustratif | Interprétation possible |
| --- | --- |
| `video_impression` | Contenu réellement présenté |
| `video_start` | Démarrage de lecture |
| `watch_time_ms` | Temps réellement consommé |
| `watch_percentage` | Proportion regardée |
| `video_complete` | Lecture terminée |
| `video_replay` | Nouvelle lecture |
| `skip` | Passage à la suite |
| `early_skip` | Abandon très rapide |
| `like` | Retour positif explicite |
| `comment` | Interaction active |
| `share` | Partage |
| `save` | Consultation ultérieure envisagée |
| `follow_creator` | Intérêt pour le créateur |
| `profile_visit` | Visite du profil |
| `not_interested` | Rejet explicite |
| `report` | Signalement |
| `search_query` | Intention exprimée par une recherche |

Ce sont des exemples exploitables, pas une liste certifiée de toutes les variables de chaque plateforme.

### 3.2 Visionnage et biais de durée

| Vidéo | Durée | Temps regardé | Proportion |
| --- | ---: | ---: | ---: |
| A | 15 s | 15 s | 100 % |
| B | 60 s | 45 s | 75 % |
| C | 180 s | 120 s | 66,7 % |

Le taux de complétion seul ne suffit pas à départager ces contenus. Considérer temps absolu, proportion, durée totale, moment d'abandon, relectures, satisfaction et habitudes sur des vidéos comparables.

Terminer un clip de 12 secondes et une vidéo de 20 minutes ne représentent pas le même comportement. Corriger les biais de durée est essentiel pour comparer shorts et vidéos longues.

La conversation attribue à TikTok une importance généralement plus forte des interactions que des paramètres de l'appareil, et à YouTube la distinction entre durée consommée et satisfaction.

## 4. Comprendre les vidéos

### Analyse multimodale

- Image/vidéo : objets, scènes, mouvements, actions ; options citées : ViT, CLIP et réseaux vidéo.
- Audio : transcription, langue, musique et événements sonores.
- Texte : titre, description, hashtags, sous-titres et texte dans les images.

Ces modèles sont des options d'ingénierie, pas nécessairement les architectures exactes déployées par chaque plateforme.

### 4.1 Classification multi-étiquette

Une vidéo peut relever de plusieurs thèmes. Exemple fictif :

```json
{
  "videoId": "vid_84721",
  "language": "fr",
  "country": "CD",
  "durationSeconds": 42,
  "topics": {
    "football": 0.98,
    "cristiano_ronaldo": 0.94,
    "sports_news": 0.81,
    "entertainment": 0.67
  },
  "detectedObjects": ["football", "player", "stadium"],
  "audioLanguage": "fr",
  "transcript": "Cristiano Ronaldo vient de marquer...",
  "moderationStatus": "eligible"
}
```

Les probabilités sont inventées pour expliquer le format.

### 4.2 Embeddings

Un embedding représente numériquement les caractéristiques ou le sens d'un contenu. Utilisateurs et vidéos peuvent être projetés dans un espace où leurs affinités deviennent mesurables.

```text
Vidéo football :     [0.87, 0.12, 0.43, 0.91, ...]
Vidéo musique :      [0.14, 0.93, 0.22, 0.07, ...]
Profil utilisateur : [0.81, 0.19, 0.48, 0.85, ...]

Similarité cosinus : sim(u, v) = (u · v) / (||u|| × ||v||)
```

Les vecteurs peuvent comporter des centaines de dimensions ou davantage. L'objectif est de retrouver des contenus proches même si mots, hashtags ou langues diffèrent. La source cite les réseaux Two-Tower décrits pour Instagram Explore.

## 5. Construire les intérêts dans le temps

| Horizon | Exemple | Rôle |
| --- | --- | --- |
| Long terme | Football depuis des années | Préférences stables |
| Moyen terme | Programmation depuis un mois | Évolution des intérêts |
| Session | Cuisine depuis dix minutes | Intention immédiate |

Suivre un intérêt nouveau sans effacer les préférences historiques. Exemple proposé, non formule officielle de TikTok :

```text
U = α × U_long + β × U_medium + γ × U_session
```

Les coefficients peuvent varier selon le contexte. Décroissance temporelle classique :

```text
w(t) = exp(-λ × t)
```

`t` désigne l'ancienneté et `λ` la vitesse de décroissance. Des modèles séquentiels peuvent exploiter l'ordre des événements et les changements de sujet, au-delà d'une moyenne pondérée.

## 6. Rechercher les vidéos candidates

Éviter d'évaluer tout le catalogue avec un modèle coûteux à chaque requête. Exemple purement illustratif :

```text
Catalogue : 100 000 000 vidéos
    → retrieval : 10 000
    → classement initial : 1 000
    → classement approfondi : 100
    → page finale : 20
```

Sources possibles : similarité sémantique, utilisateurs aux comportements proches, créateurs suivis, tendances communautaires, publications récentes, recherches récentes et nouveaux thèmes à explorer.

### Filtrage collaboratif

| Utilisateur | Vidéo A | Vidéo B | Vidéo C | Vidéo D |
| --- | --- | --- | --- | --- |
| 1 | Aimée | Aimée | ? | ? |
| 2 | Aimée | Aimée | Aimée | Ignorée |
| 3 | Ignorée | Aimée | Aimée | Aimée |

La proximité des utilisateurs 1 et 2 permet de proposer C à l'utilisateur 1. Approches citées : factorisation matricielle, item-to-item, Two-Tower, recherche de voisins approximatifs — ANN, graphes et retrieval séquentiel.

### Two-Tower

```text
Historique, intérêts, session, langue → User Tower → f(u)
Texte, audio, image, sujets, créateur → Video Tower → g(v)

Score de récupération : s(u, v) = f(u)ᵀ × g(v)
```

La conversation cite Instagram Explore pour la récupération multi-source, en temps réel et depuis des intérêts durables.

## 7. Classer les vidéos

Le modèle prédit plusieurs résultats selon l'utilisateur `u`, la vidéo `v` et le contexte `c` :

```text
P(like | u, v, c)
P(share), P(follow), P(skip)
E(watch time), E(satisfaction)
```

Un modèle multi-tâches partage des représentations et produit plusieurs prédictions.

### Simulateur retranscrit

Les valeurs du simulateur interactif sont **entièrement fictives** :

```text
score = wLike × pLike + wShare × pShare
      + wWatch × watchNormalisé - wSkip × pSkip
```

Poids affichés : like `1.0`, partage `3.0`, visionnage `2.0`, pénalité de skip `3.0`.

| Rang affiché | Vidéo | Score |
| ---: | --- | ---: |
| 1 | A — Football | 2.860 |
| 2 | C — Technologie | 2.610 |
| 3 | B — Humour | 1.590 |

Ces valeurs ne sont pas les poids des plateformes. L'exemple montre que les likes seuls ne déterminent pas le classement.

Les prédictions réelles demandent normalisation et calibration. Les fonctions peuvent être non linéaires et dépendre de l'utilisateur, de la surface et du contexte. Certaines règles constituent des contraintes non compensables par un score. La source cite les prédictions Meta `PLIKE`, `PCOMMENT` et `PFOLLOW`.

## 8. Réorganiser, diversifier et explorer

### 8.1 Diversification

Un classement exclusivement consacré à un même joueur peut devenir monotone malgré de bons scores. La source illustre un feed alternant football, actualité congolaise, technologie et humour africain, avec retours au thème dominant.

### 8.2 Contraintes possibles

- Dédupliquer vidéos et copies proches.
- Limiter les répétitions de créateurs et varier les thèmes.
- Respecter confidentialité, âge, disponibilité et restrictions géographiques.
- Éviter une concentration excessive sur des sujets sensibles.
- Laisser une place aux nouveaux créateurs.
- Appliquer les règles publicitaires et sponsorisées.

Les contrôles peuvent intervenir à plusieurs étapes. La conversation attribue à TikTok une recherche de variété et l'évitement général des vidéos déjà vues.

### 8.3 Exploration et exploitation

L'exploitation privilégie les intérêts estimés ; l'exploration teste des contenus moins certains pour découvrir d'autres préférences.

```text
Politique ε-greedy : explorer avec probabilité ε ; exploiter sinon.
```

`ε = 0,10` est un exemple d'environ 10 % d'exploration, pas une valeur révélée par TikTok. Autres approches citées : contextual bandits, Upper Confidence Bound, Thompson Sampling et diversification tenant compte de l'incertitude.

## 9. Apprendre en continu

| Mécanisme | Modification | Rythme possible |
| --- | --- | --- |
| Session | Actions et sujets récents | Temps réel ou quasi réel |
| Caractéristiques | Statistiques et embeddings | Continu ou lots |
| Réentraînement | Paramètres des modèles | Cycles de formation et déploiement |

Une recommandation peut changer après une vidéo sans réentraîner le réseau : les caractéristiques de session ont changé et les scores sont recalculés. La source rapproche cela des événements temps réel décrits par Meta pour Facebook.

## 10. Plateformes et viralité

### TikTok — For You

Découverte fondée sur interactions, contenu et contexte : visionnage, complétion, abandon, likes, partages et commentaires. Les recommandations ne se limitent pas aux comptes suivis. Selon une ancienne description publique mentionnée dans la conversation, le nombre d'abonnés n'est pas un facteur direct ; une audience existante peut toutefois multiplier les occasions initiales d'exposition.

### YouTube — Home, Suggested, Shorts

La source cite clics, durée, likes, dislikes, partages, enquêtes et **valued watchtime**. Pour les vidéos classiques : miniature et tenue de la promesse après le clic. Pour les Shorts : visionnage et balayage vers la suite. La distribution dépend aussi des performances relatives aux contenus concurrents.

### Instagram — Reels et Explore

Feed, Stories, Explore et Reels ont des systèmes distincts. La conversation évoque récupération, classement initial et approfondi, et prédictions d'interaction. Découverte de comptes non suivis et effets des relations sociales coexistent.

### Facebook — Reels et Feed

Signaux comportementaux, relations, pertinence et UTIS. La source attribue aussi à une annonce Meta d'octobre 2026 **« Your algorithm »**, permettant d'exprimer des préférences de sujets, y compris en langage naturel. Cette affirmation datée est conservée comme contenu de la conversation, à vérifier avant réutilisation.

### Distribution des vidéos virales

La règle « 200 personnes, puis 1 000, puis 10 000 » n'est pas présentée comme une règle universelle documentée.

Mécanisme proposé : éligibilité d'un contenu, récupération dans des contextes pertinents, estimation d'audience malgré peu de données, premières observations, mise à jour des estimations, puis évolution du classement selon qualité estimée, audience, concurrence et contraintes. Plusieurs vagues de visibilité n'impliquent pas une échelle fixe de vues.

## 11. Architecture serveur et événements

### 11.1 Architecture de référence proposée

```text
Web / iOS / Android
    ↓
API Gateway / BFF : authentification, limites, routage
    ├── Event Ingestion → Kafka / Redpanda
    │       → Stream Processing : Flink / workers
    │       → Feature Store : Redis / OLAP
    └── Recommendation API
            → Candidate Retrieval : index vectoriel
            → Ranking Service : modèles ML
            → Policy Engine + re-ranking
            → Feed : identifiants, métadonnées, lecture via CDN

Hors ligne : Data Lake → Training → Model Registry → Déploiement → Ranking
```

Proposition d'ingénierie, pas reproduction de l'infrastructure privée des plateformes ni décision de migration de TALA.

Exemple de requête :

```json
{
  "userId": "user_1029",
  "sessionId": "session_773",
  "surface": "FOR_YOU",
  "limit": 20,
  "cursor": "cursor_abc",
  "context": {
    "language": "fr",
    "country": "CD",
    "deviceType": "android"
  }
}
```

Le serveur authentifie, lit session et intérêts, interroge les sources, filtre, classe, diversifie et retourne un curseur. Il distingue vidéos servies et réellement exposées.

**Rapprochement avec TALA :** ce payload illustratif n'est pas un contrat d'API accepté tel quel. L'identité authentifiée reste déterminée côté serveur par les tokens, comme dans l'API actuelle.

### Impression, envoi et lecture

Précharger dix vidéos ne signifie pas qu'elles ont toutes été vues. Si l'utilisateur quitte après la deuxième, enregistrer dix visionnages fausserait les données.

| Événement | Sens |
| --- | --- |
| `candidate_generated` | Candidat trouvé |
| `ranked` | Vidéo classée |
| `served` | Vidéo envoyée |
| `impression` | Exposition effective, définition à fixer |
| `play_start` | Lecture démarrée |
| `engaged_view` | Visionnage répondant à un critère de durée |
| `play_end` | Fin de lecture |
| `skip` | Abandon ou passage à la suite |

La conversation mentionne une clarification YouTube en 2026 sur vues et engaged views des Shorts ; attribution datée à vérifier avant de l'utiliser comme référence produit.

### 11.2 Exemple d'événement

```json
{
  "eventId": "evt_9d82",
  "eventType": "video_play_end",
  "userId": "user_1029",
  "videoId": "video_482",
  "sessionId": "session_773",
  "impressionId": "imp_450",
  "timestamp": "2026-11-03T14:20:30Z",
  "playback": {
    "durationMs": 45000,
    "watchedMs": 39000,
    "watchRatio": 0.8667,
    "completed": false,
    "replayCount": 0,
    "muted": false
  },
  "context": {
    "surface": "FOR_YOU",
    "position": 3,
    "networkType": "4G"
  },
  "recommendation": {
    "requestId": "req_88",
    "modelVersion": "ranker-v12",
    "experimentId": "exp_04"
  }
}
```

Points à gérer : idempotence, doublons, événements tardifs ou désordonnés, déconnexions et reprises, exclusion des pauses, changements de réseau, autoplay non voulu, multi-appareils, minimisation, conservation, fraude, robots et cohérence avec l'entraînement.

## 12. Modèles envisageables

| Famille | Rôle | Exemples |
| --- | --- | --- |
| Filtrage collaboratif | Affinités utilisateurs/contenus | ALS, factorisation matricielle |
| Gradient boosting | Ranking tabulaire | LightGBM, XGBoost |
| Two-Tower | Recherche de candidats | Encodeurs utilisateur/vidéo |
| Deep ranking | Prédictions multiples | MLP multi-tâches |
| Séquentiel | Ordre des intérêts | Transformers, GRU4Rec, SASRec |
| Multimodal | Image, texte et audio | CLIP, ViT, modèles audio |
| Graphes | Relations utilisateurs/vidéos | Graph Neural Networks |
| Contextual bandits | Exploration/exploitation | LinUCB, Thompson Sampling |

Combinaison proposée : Two-Tower pour le retrieval, LightGBM ou réseau multi-tâches pour le ranking, puis re-ranking contraint. Un Transformer géant n'est pas nécessaire pour commencer.

### Pseudocode conservé

Les fonctions appelées sont des services à développer. Ce code illustratif n'est pas un module exécutable livré dans TALA.

```python
async def recommend_feed(user_id: str, limit: int = 20):
    # 1. Lire le contexte utilisateur
    profile = await user_store.get_profile(user_id)
    session = await session_store.get_recent_events(user_id)

    # 2. Calculer les représentations
    user_vector = user_encoder.encode(profile, session)

    # 3. Récupérer des candidats par plusieurs sources
    sources = await asyncio.gather(
        vector_index.search(user_vector, top_k=500),
        collaborative_service.get_candidates(user_id, limit=300),
        trending_service.get_candidates(profile.country, limit=100),
        following_service.get_candidates(user_id, limit=100),
        exploration_service.get_candidates(profile, limit=100)
    )

    candidates = deduplicate(flatten(sources))

    # 4. Appliquer les contraintes d'éligibilité
    candidates = await policy_engine.filter(
        user=profile,
        videos=candidates
    )

    # 5. Construire les features de ranking
    features = await feature_service.build_batch(
        profile, session, candidates
    )

    # 6. Prédire différents résultats
    predictions = await ranker.predict_batch(features)

    scored_videos = []
    for video, p in zip(candidates, predictions):
        score = (
            2.0 * p.expected_watch_value
            + 1.0 * p.p_like
            + 3.0 * p.p_share
            + 2.0 * p.p_satisfaction
            - 4.0 * p.p_early_skip
        )

        scored_videos.append((video, score))

    # 7. Réorganiser en tenant compte de la diversité
    feed = reranker.apply(
        scored_videos,
        max_per_creator=2,
        diversify_topics=True,
        limit=limit
    )

    # 8. Journaliser les recommandations servies
    await impression_service.record_served(user_id, feed)

    return feed
```

Les coefficients sont démonstratifs ; ils supposent normalisation, expérimentation et filtrage robuste. Ce ne sont pas les poids des plateformes.

## 13. Entraînement et biais

### 13.1 Exemples et fuite de données

| User | Vidéo | Watch ratio | Like | Share | Skip |
| --- | --- | ---: | ---: | ---: | ---: |
| U1 | V1 | 0,95 | 1 | 1 | 0 |
| U1 | V2 | 0,12 | 0 | 0 | 1 |
| U2 | V1 | 0,68 | 1 | 0 | 0 |
| U3 | V3 | 0,08 | 0 | 0 | 1 |
| U3 | V4 | 1,00 | 1 | 1 | 0 |

Les comportements postérieurs à l'impression deviennent les labels ; les features correspondent aux données disponibles avant cette exposition. Utiliser les likes de demain pour une recommandation d'aujourd'hui constitue une fuite de données — data leakage.

### 13.2 Perte multi-objectifs

```text
L = λ1 × L_like + λ2 × L_share + λ3 × L_watch
  + λ4 × L_skip + λ5 × L_satisfaction
```

Pertes citées : Binary Cross-Entropy pour les actions binaires, régression pour le visionnage, ranking loss, pairwise loss et listwise loss. La calibration vérifie que les probabilités correspondent aux fréquences observées.

### 13.3 Rétroaction et biais de sélection

Le moteur apprend sur ce qu'il choisit de montrer. Favoriser constamment les créateurs populaires peut renforcer leur avantage et priver les nouveaux de données.

Pistes : exploration contrôlée, probabilités d'exposition, correction de propension — notamment Inverse Propensity Scoring, jeux temporellement séparés, évaluation par segments, diversité et concentration. Une vidéo jamais réellement vue ne doit pas être assimilée à un rejet observé.

## 14. Évaluer le moteur

### Hors ligne

| Métrique | Objet |
| --- | --- |
| Precision@K | Pertinence des K premiers résultats |
| Recall@K | Retrouver les contenus pertinents |
| NDCG@K | Qualité de l'ordre |
| MAP@K | Positions des résultats pertinents |
| AUC-ROC | Discrimination d'un classificateur |
| Log Loss | Qualité des probabilités |
| Calibration Error | Prédictions face aux fréquences |
| Coverage | Couverture du catalogue |
| Diversity | Variété des thèmes et créateurs |
| Novelty | Contenus nouveaux pour l'utilisateur |

### En ligne

Expériences A/B sur visionnage ajusté à la durée, satisfaction, abandons rapides, partages, retour à J7/J30, diversité des créateurs, signalements, latence, consommation réseau et interruptions de lecture.

CTR et temps passé peuvent augmenter alors que la satisfaction baisse : titres trompeurs ou attention captée sans valeur. Ne pas confondre engagement immédiat et qualité de la recommandation.

### Résultats UTIS rapportés dans la conversation

| Indicateur attribué à Meta | Résultat cité |
| --- | --- |
| Précision des intérêts identifiés | 63,2 %, contre 48,3 % pour la référence |
| Évaluations d'intérêt élevées | +5,4 % |
| Engagement total | +5,2 % |
| Évaluations d'intérêt faibles | −6,84 % |

La conversation attribue ces chiffres à Meta, à ses expérimentations et à une publication du 14 janvier 2026. Archivés sans nouvelle vérification ici ; aucun résultat garanti pour TALA.

## 15. Matrice des paramètres

Inventaire de conception, pas liste secrète exhaustive des plateformes.

| Domaine | Paramètres cités | Rôle |
| --- | --- | --- |
| Identité/contexte | Langue, pays, fuseau, appareil, préférences | Pertinence et accès |
| Historique | Visionnages, recherches, interactions | Préférences |
| Visionnage | Durée, proportion, progression, relectures, abandon | Intérêt implicite |
| Engagement | Likes, commentaires, partages, sauvegardes, abonnements | Actions prédites |
| Intérêts | Thèmes, embeddings, récent et durable | Personnalisation |
| Contenu | Texte, audio, images, durée, langue | Sémantique |
| Créateur | Historique, qualité, audience, fiabilité | Pertinence et risques |
| Popularité | Vues, engagement, tendance, croissance | Contenus prometteurs |
| Temporalité | Publication, ancienneté des interactions | Fraîcheur |
| Social | Abonnements, relations, intérêts communs | Découverte sociale |
| Session | Derniers contenus, changements d'intérêt, contexte | Adaptation immédiate |
| Qualité technique | Résolution, interruptions, compatibilité, réseau | Lecture effective |
| Sécurité | Modération, âge, signalements, droits | Éligibilité |
| Intégrité | Bots, faux engagements, spam, reposts | Antimanipulation |
| Exploration | Nouveaux créateurs, thèmes inconnus, incertitude | Découverte |
| Diversité | Répétition, similarité, concentration | Variété |
| Satisfaction | Retours, sondages, regrets de visionnage | Qualité perçue |
| Infrastructure | Latence, cache, coût d'inférence, fraîcheur des features | Passage à l'échelle |
| Business | Monétisation, publicités, équilibre économique | Viabilité et règles publicitaires distinctes |
| Gouvernance | Consentement, confidentialité, suppression, audit | Confiance |

La source recommande de ne pas transformer toute caractéristique prévisible en objectif : éviter enfermement dans des profils sensibles, aggravation de comportements compulsifs et promotion de contenus nocifs parce qu'ils captent l'attention. Satisfaction et bien-être ne se réduisent pas au temps passé.

## 16. Progression proposée pour TALA

### Phase 1 — Recommandations hybrides MVP

Intérêts déclarés, abonnements, catégories, popularité corrigée, interactions simples et diversification. Technologies proposées : NestJS, PostgreSQL, Redis et workers.

### Phase 2 — Personnalisation ML

Embeddings, filtrage collaboratif et modèle de ranking évalué. Options : Python, PyTorch, LightGBM, pgvector ou Qdrant.

### Phase 3 — Temps réel

Streaming d'événements, profil de session actualisé et optimisation des performances. Options : Kafka ou Redpanda, feature store, services d'inférence et observabilité.

### Phase 4 — Recommandation industrielle

Modèles multi-tâches et séquentiels, A/B continus, exploration adaptative, pipelines ML distribués, registre de modèles et inférence scalable.

### Technologies proposées dans la conversation

| Composant | Proposition |
| --- | --- |
| Web | Next.js |
| Mobile | React Native |
| API métier | NestJS |
| Transactions | PostgreSQL |
| Cache et sessions | Redis |
| Traitement vidéo | FFmpeg et workers |
| Stockage | Object storage compatible S3 |
| Diffusion | CDN |
| ML | Python et PyTorch |
| Ranking initial | LightGBM |
| Embeddings | Modèle multimodal et pgvector |
| Tâches | BullMQ, puis streaming si nécessaire |
| Analyse produit | ClickHouse si le volume le justifie |
| Monitoring | OpenTelemetry, Prometheus, Grafana |

Pour une audience africaine, tenir compte du coût des données mobiles et de l'hétérogénéité des connexions : une recommandation doit aussi être lisible confortablement. La source propose de séparer recommandation et rémunération des créateurs pour limiter les incitations aux fausses vues.

**Rapprochement avec l'existant :** S3/CDN et Redis ne remplacent pas le [pipeline livré](videos-implementation.md), testable sans Docker avec PostgreSQL et stockage privé local, avec connecteur Mux. Python concerne une éventuelle couche ML future ; AuthServer et API métier restent en NestJS.

## 17. Configuration expérimentale versionnée

Exemple conservé de la conversation :

```yaml
recommendation:
  retrieval:
    vector_top_k: 500
    collaborative_top_k: 300
    trending_top_k: 100
    following_top_k: 100
    exploration_top_k: 100

  ranking:
    model: "lightgbm-v1"
    batch_size: 1000
    enable_calibration: true

  diversity:
    max_same_creator_per_page: 2
    deduplicate_videos: true
    diversify_topics: true

  exploration:
    enabled: true
    strategy: "epsilon_greedy"
    epsilon: 0.10

  safeguards:
    enforce_age_restrictions: true
    enforce_geo_restrictions: true
    exclude_blocked_creators: true
    exclude_ineligible_content: true

  observability:
    log_model_version: true
    log_experiment_id: true
    log_candidate_sources: true
    track_served_items: true
```

Valeurs démonstratives à expérimenter, pas paramètres optimaux ni configuration actuelle de TALA.

## 18. Ce qui reste propriétaire

| Élément | Statut décrit dans la conversation |
| --- | --- |
| Familles de signaux et architecture multi-étapes | Documentées |
| Filtrage collaboratif et réseaux neuronaux | Travaux techniques publics |
| Visionnage, likes, partages | Usage confirmé publiquement |
| Diversification et filtrage | Décrits publiquement |
| Satisfaction et enquêtes | Décrites pour YouTube et Meta |
| Poids exacts des événements | Non publiés exhaustivement |
| Modèles actuels complets | Propriétaires |
| Hyperparamètres de production | Non publics |
| Distribution exacte des nouvelles vidéos | Non publiée intégralement |
| Fréquences de réentraînement | Non publiées intégralement |
| Code de production complet | Non public |
| Ensemble des règles antifraude | Protégé |

Une formule donnant un nombre fixe de points à chaque partage ou un nombre exact d'expositions systématiques ne devient pas un fait sans preuve officielle.

## 19. Références fournies dans le partage

Liens récupérés directement dans la réponse, sans paramètres de suivi :

1. [Deep Neural Networks for YouTube Recommendations](https://research.google.com/pubs/archive/45530.pdf) — Google, 2016 ; architecture historique de génération de candidats et classement, pas description exhaustive du système de 2026.
2. [Scaling the Instagram Explore Recommendations System](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/) — Two-Tower, sources de candidats et phases de classement.
3. [Inside Facebook's Video Delivery System](https://engineering.fb.com/2024/12/10/video-engineering/inside-facebooks-video-delivery-system/) — requêtes vidéo et données de session.
4. [Adapting the Facebook Reels RecSys AI Model Based on User Feedback](https://engineering.fb.com/2026/01/14/ml-applications/adapting-the-facebook-reels-recsys-ai-model-based-on-user-feedback/) — référence donnée pour UTIS et la satisfaction.
5. [TikTok — Comment le contenu est recommandé](https://support.tiktok.com/fr/using-tiktok/exploring-videos/how-tiktok-recommends-content) — personnalisation et surfaces.

La source affiche aussi les libellés « YouTube Blog », « blog.youtube », « TikTok » et « À propos de Facebook ». Leurs URLs n'étaient pas exposées dans les liens récupérés de cette page ; elles ne sont pas inventées ici. Les affirmations concernées restent à sourcer précisément avant utilisation.

## Enseignements et suite conservés pour TALA

Défis principaux : prédire l'intérêt réel au-delà du clic ; évaluer les nouveaux contenus sans favoriser systématiquement les créateurs populaires ; adapter rapidement les recommandations avec une infrastructure soutenable.

Suite proposée dans la conversation : conception adaptée à un développeur solo et un budget limité, comprenant tables PostgreSQL, événements, services NestJS, API et scoring initial, puis modèles Python, entraînement et déploiement si les données le justifient. Les approfondissements suggérés portent sur Two-Tower, la pondération temporelle et le filtrage collaboratif par matrices.

Pistes futures, **non réalisées dans ce lot documentaire** :

- [ ] Vérifier les références et affirmations datées nécessaires à la conception.
- [ ] Définir impression, visionnage, pause, reprise, complétion et skip.
- [ ] Concevoir collecte, idempotence, conservation et suppression.
- [ ] Définir sources de candidats, feed MVP et règles d'éligibilité.
- [ ] Définir métriques de satisfaction, diversité, lecture et coût.
- [ ] Choisir et versionner les paramètres expérimentaux.
- [ ] Décrire les étapes ML selon les données réellement disponibles.

Documents associés : [fonctionnalités](fonctionnalites.md), [architecture backend](architecture-backend.md), [implémentation vidéo](videos-implementation.md).
