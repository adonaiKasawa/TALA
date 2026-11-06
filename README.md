# TALA — Web, mobile natif et backend

Deux projets indépendants créés avec Nest CLI : `authserver/` et `api/`. Le dossier `docs/` contient la conception. `.previous-attempt/` conserve la tentative abandonnée et ne doit pas être déployé.

Les clients `web/` (Next.js 16.4.4) et `mobile/` (React Native 0.88.1 sans Expo) sont créés avec leurs CLI officiels. Ils proposent les parcours de compte, de sécurité, de profil et le [fil vidéo avec interactions](docs/visionnage-implementation.md). La recommandation personnalisée est reportée. Voir le [guide web et mobile](docs/clients-web-mobile.md).

Pour tester les interfaces sur ce poste, arrêter les anciens serveurs dans leurs terminaux, puis lancer `node .\scripts\dev.mjs` à la racine. Ouvrir [le fil vidéo](http://localhost:3000) et [la boîte email locale](http://localhost:8025). Aucun formulaire JSON n'est nécessaire. L’onglet « Mes vidéos » permet l’import, la préparation FFmpeg, la publication et la lecture. Le worker local utilise PostgreSQL sans Docker ; voir [le guide vidéo](docs/videos-implementation.md). `Ctrl+C` arrête les services du lanceur. Les guides expliquent la reconstruction et le lancement Android avec Metro et Java directement.

## Origine des projets

```powershell
nest new authserver --package-manager npm --skip-git --skip-install
nest new api --package-manager npm --skip-git --skip-install
```

Les installations standard sont effectuées ensuite dans chaque projet. Chaque application possède son propre `package.json`, lockfile et configuration Nest. Les scripts d'installation des dépendances sont désactivés par défaut dans `.npmrc` ; les opérations nécessaires sont exécutées explicitement après inspection.

## Vérification

- [Caméra, navigation et profils](docs/camera-navigation-profils.md) : caméra directe, galerie, cinq onglets, grilles et première messagerie privée.

- [Montage mobile en plein écran](docs/montage-plein-ecran.md) : outils, export des calques, notifications et reconstruction Android.

- [Guide de l'AuthServer](authserver/VERIFICATION.md) : lancement, inscription, email local, MFA, OAuth et administration.
- [Suivi de conformité](docs/authserver-conformite.md) : contrôles testés et critères encore ouverts.
- AuthServer : `http://localhost:4000` ; base PostgreSQL `tala_authserver`.
- [API et profils](docs/api-profils.md) : PostgreSQL `tala_db`, validation JWT et profils ; endpoints sous `http://localhost:4001/api/v1`, Swagger sous `/docs`.

Les fichiers `.env` locaux sont déjà configurés sur ce poste et exclus de Git. Les exemples utilisent des valeurs fictives. Aucun compte administrateur ni mot de passe de démonstration n'est créé automatiquement.

Dans deux terminaux séparés, depuis les dossiers concernés :

```powershell
cd authserver
npm run build
npm run start:prod
```

```powershell
cd api
npm run build
npm run start:prod
```

Node.js 24 LTS est la cible d'exécution recommandée. Les tests d'intégration utilisent des comptes temporaires et un fournisseur OIDC local, sans comptes Google/Apple réels ni remise d'email externe.
