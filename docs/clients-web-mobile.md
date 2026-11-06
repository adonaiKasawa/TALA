# Clients TALA — web et mobile natif

Création le 3 novembre 2026 avec les CLI officiels, avant installation des dépendances et développement :

```powershell
npx --yes create-next-app@latest web --ts --eslint --app --src-dir --no-tailwind --use-npm --skip-install --disable-git --no-agents-md --no-agent-feedback --yes
npx --yes @react-native-community/cli@latest init TalaMobile --directory mobile --skip-install --skip-git-init --pm npm
```

Versions résolues : create-next-app/Next.js 16.4.4 ; Community CLI 20.2.0 ; React Native 0.88.1. Les fichiers natifs Android et iOS proviennent du template officiel. Expo n'est pas utilisé.

## Contrat d'interface

L'espace client sert à créer son compte, se connecter, compléter son profil et gérer sa sécurité. L'action principale dépend de l'état : se connecter sans session, créer son profil au premier accès, enregistrer les changements ensuite. Depuis le 4 novembre, l'accueil propose le [fil de visionnage et les interactions](visionnage-implementation.md), alimentés par les vidéos réellement publiées ; la recommandation personnalisée reste reportée.

Palette : bleu action `#2255D9`, encre `#14213D`, fond `#F3F6FA`, surface `#FFFFFF`, succès `#146B5E`, erreur `#A71D45`. Typographie système : Aptos/Segoe UI sur web, police native sur mobile. Le mot-symbole TALA et son signe de lecture constituent le repère visuel ; les champs et états restent sobres.

Sur ordinateur : navigation à gauche, contenu aligné à gauche, largeur de lecture bornée. Sur téléphone : une colonne, navigation accessible, clavier adapté aux champs et actions suffisamment grandes. Prévoir chargement, absence de profil, erreurs par champ, expiration de session, confirmations des opérations sensibles et réception des codes de secours. Aucun token ne doit apparaître dans les vues.

Les formulaires parlent de compte, profil et sécurité ; les termes OAuth, scopes, payload et JSON ne sont pas exposés dans les parcours client. Les boutons de connexion externe n'apparaissent que si le fournisseur est réellement configuré.

## Parcours livrés

| Parcours | Web | React Native |
| --- | --- | --- |
| Inscription, vérification et renvoi d'email | Formulaires AuthServer | Navigateur système, retour dans l'application |
| Connexion, consentement, mot de passe oublié/réinitialisé | Pages AuthServer puis retour web | AppAuth, PKCE, navigateur système |
| Déconnexion et renouvellement | BFF et fermeture de session AuthServer | AppAuth et révocation |
| Création/modification du profil, liens et préférences | Formulaire complet | Écran natif complet |
| Consultation publique et profil privé | `/profil/:username` | Recherche par pseudonyme |
| Changement de mot de passe | Formulaire et reconnexion | Écran natif et reconnexion |
| MFA TOTP, codes de secours, renouvellement, désactivation | Clé manuelle et lien authentificateur | Clé sélectionnable et ouverture authentificateur |
| Sessions et applications autorisées | Listes et révocation | Écrans natifs et révocation |
| Association/dissociation des fournisseurs externes | Relais navigateur à usage unique | Même relais, retour par lien d'application |
| Export, suppression de profil/compte | Téléchargement et confirmations | Partage système et confirmations |

Les points 1–3 précédents restent : base métier PostgreSQL séparée, API protégée par les tokens AuthServer, profils et préférences. Les deux clients consomment ces services existants. Les formulaires d'identité sont communs et hébergés par l'AuthServer ; aucun mot de passe n'est envoyé à l'API métier. L'administration reste dans la console AuthServer, séparée de l'espace client.

## Architecture

Le web Next.js est un BFF : le navigateur reçoit un identifiant opaque HttpOnly/SameSite ; les tokens restent chiffrés AES-256-GCM dans le schéma PostgreSQL `tala_web`, qui contient uniquement les sessions web. Une origine exacte et un jeton CSRF protègent les mutations. Les connexions utilisent des navigations sans prélecture Next.js. La CSP web utilise des nonces ; l'AuthServer autorise le retour des formulaires uniquement vers le client déjà validé.

Le mobile utilise `react-native-app-auth` et le navigateur système avec PKCE/nonce, sans secret client. Les tokens sont conservés dans `react-native-keychain`. Les projets Android et iOS sont présents ; aucun runtime Expo n'est utilisé. Les schémas `tala://oauth/callback`, `tala://oauth/logout` et `tala-app://account/linked` sont câblés sur les deux plateformes.

Le client OAuth mobile doit être enregistré avec `application_type: native` : le type web par défaut refuse ces URI personnalisées, notamment le retour de déconnexion. `scripts/setup-clients.mjs` applique ce type ; l'enregistrement administratif le déduit des retours `tala:` si le champ n'est pas fourni. Le test d'intégration natif utilise ces véritables URI, y compris le retour d'association.

Une connexion autorise deux ressources distinctes : `urn:tala:api` pour les profils et `urn:tala:identity` pour la gestion d'identité. Les audiences restent séparées. Le refresh token partagé est tournant et conservé immédiatement après renouvellement. Le web sérialise les requêtes par verrou PostgreSQL et le mobile par file d'attente, y compris après une erreur réseau. Le mobile obtient les deux ressources via `AUTH_APPLICATION_CLIENT_IDS`, car AppAuth ne transmet pas de paramètres `resource` répétés.

La fermeture de compte vérifie l'identité, supprime le profil puis le compte AuthServer. Un échec partiel est annoncé et peut être repris. Cette séquence ne remplace pas une future orchestration durable pour les vidéos, paiements, suppressions globales et suspensions.

## Lancement local

Les clients OAuth sont enregistrés et `web/.env.local` est configuré. Pour refaire cette configuration depuis la racine :

```powershell
npm run setup:clients
node scripts/setup-mailpit.mjs
```

Node.js 24 LTS est recommandé. Le lanceur choisit la copie portable déjà installée sur ce poste si le Node global n'est pas LTS. Après modification, exécuter `npm run build` dans `authserver`, `api` et `web`, puis revenir à la racine :

```powershell
npm run dev
```

Le lanceur exécute les builds existants et démarre cinq services lorsque le média est activé :

- [Espace client](http://localhost:3000).
- [AuthServer](http://localhost:4000), Swagger `/docs`.
- [API métier](http://localhost:4001/api/v1), Swagger `/docs`.
- [Boîte email de test](http://localhost:8025).
- Worker média séparé, sans port HTTP ; file PostgreSQL locale, sans Docker.

Fermer les anciens serveurs dans leurs terminaux si leurs ports sont occupés. Le lanceur refuse les doublons ; `Ctrl+C` arrête uniquement ses processus. Il est réservé au développement local sur loopback.

Mailpit 1.33.0 est une boîte SMTP locale sans remise externe ni relais. Le binaire Windows officiel est contrôlé par SHA-256. Attendre quelques secondes après l'inscription/récupération, puis ouvrir l'email et son lien dans le navigateur : aucune commande de lecture ni copie de JSON. La boîte temporaire disparaît à l'arrêt. Voir [Mailpit](https://mailpit.axllent.org/docs/install/). En production, configurer un vrai SMTP.

## Android natif

Prérequis présents : JDK 17 et SDK Android 37. Brancher un téléphone avec débogage USB autorisé ou démarrer un émulateur. Depuis `mobile`, lancer dans un terminal :

```powershell
npm start
```

Dans un autre terminal, également dans `mobile` :

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
npm run android
```

Le script compile et installe l'APK via le CLI officiel. Il établit les redirections ADB 4000/4001 ; le CLI gère Metro 8081. Garder Metro et le lanceur racine actifs, avec une seule cible Android connectée. `npm run android:build` compile sans installer. APK : `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Cet APK debug dépend de Metro et n'est pas une version de distribution. Aucun appareil n'a été modifié pendant la compilation.

Pour un téléphone sans ADB, configurer les origines réseau du poste et le même issuer exact dans tous les services et clients.

## iOS et production

Sur macOS : `bundle install` depuis `mobile`, puis `bundle exec pod install` dans `mobile/ios`, puis `npm run ios` depuis `mobile`. AppAuth, SceneDelegate/AppDelegate et les URL schemes sont configurés. Compilation et retours navigateur iOS restent à vérifier sur Mac ; Windows ne permet pas ces essais.

Avant distribution : renseigner les origines HTTPS et `publicWebOrigin` dans `mobile/src/config.ts`, enregistrer les retours de production, configurer signature et liens d'application vérifiés. Les origines de release sont vides pour empêcher l'emploi accidentel du serveur local. Google/Apple demandent vos identifiants fournisseur ; seuls les fournisseurs configurés apparaissent. Le [parcours vidéo et Mux](videos-implementation.md), le fil chronologique et les interactions sociales sont implémentés ; téléversement de photo et recommandation personnalisée restent à développer.

## Validation

- Web : lint, TypeScript, build Next.js et parcours réel Edge avec NestJS/PostgreSQL isolé. Le test couvre import vidéo, worker séparé, fil, lecture, sous-titres chargés, interactions, historique et publication/suppression, puis inscription/email, connexion/déconnexion, profil privé, responsive 320/390/768/1024/1440 px, CSRF, six refresh concurrents, panne/reprise après rotation, MFA/code de secours, changement/récupération du mot de passe, export sans secrets et fermeture du compte.
- AuthServer : 5 tests unitaires et 18 scénarios d'intégration, dont le client natif à deux ressources et le relais navigateur d'association.
- Mobile : TypeScript, lint, 10 tests Jest, bundle Metro Android et compilation Gradle d'un APK debug arm64. Tests de sérialisation des refresh, conservation après erreur API, préchargement distinct d'une impression, arrêt de lecture, sélection des sous-titres, seuils de buffer Android et activation du lecteur après chargement/actualisation du fil.
- Parcours Android connexion → profil → import depuis le sélecteur natif → traitement → publication → lecture vérifié sur téléphone le 5 novembre 2026, ainsi que pause, son, J'aime, favoris, commentaires, défilement, historique et arrêt en arrière-plan. [Résultats et limites de cette validation](validation-mobile-2026-11-05.md). iOS, Mux adaptatif et les fournisseurs Google/Apple réels restent à valider.

Exécuter les suites d'intégration successivement : elles partagent les bases et limites locales de test. Comptes, clients et ports sont temporaires ; les fixtures sont nettoyées. Captures sous `web/.local/`. Commande web : `npm run test:e2e`, backends construits et PostgreSQL actif ; Edge peut être remplacé avec `BROWSER_EXECUTABLE`.

Audit npm du 3 novembre 2026 : aucune alerte dans les dépendances de production web. Le graphe React Native signale quatre alertes faibles issues de `deepmerge` dans les outils Community CLI (un même problème propagé aux dépendants), sans version corrigée publiée. Aucun objet utilisateur distant n'est fusionné avec cette bibliothèque dans le code applicatif. Suivi : [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Ne pas rétrograder le CLI vers une version incompatible uniquement pour effacer l'alerte.
