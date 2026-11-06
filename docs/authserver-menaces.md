# AuthServer — frontières et contrôles à vérifier

Les données sensibles sont les identifiants, secrets MFA, sessions, grants, jetons et droits d'administration. Le navigateur, les applications clientes et les réponses des fournisseurs externes sont des entrées non fiables.

| Frontière | Abus | Contrôle attendu |
| --- | --- | --- |
| Login | Énumération, brute force | Réponses génériques, Argon2id, limites partagées |
| Autorisation | Redirection malveillante, code intercepté | URI exactes, PKCE S256, state/nonce côté client |
| Token | Code rejoué, refresh concurrent | Persistance et consommation atomiques, verrou interprocessus |
| Interactions | CSRF, contournement MFA | Cookie signé et jeton CSRF, état d'interaction vérifié |
| Compte | Accès à un autre utilisateur | Sujet du token et propriétaire vérifiés en base |
| Administration | Élévation de privilèges | Rôle serveur et MFA récente ; aucune auto-attribution |
| Fournisseur externe | Account takeover | Vérification OIDC, sujet par fournisseur, pas de fusion sur email |
| Stockage | Vol des tokens/secrets | Hachage des actions, chiffrement des objets sensibles et MFA |
| Déploiement | Fuite de clés ou logs | Secrets persistants hors Git, logs sans corps ni tokens |

Les tests doivent exercer les refus et les courses concurrentes, pas seulement les connexions réussies. Les services SMTP et les connexions réelles Google/Apple requièrent une configuration de déploiement ; ils ne doivent jamais être simulés silencieusement en production.

Les preuves locales et les contrôles restant à valider sont recensés dans [le suivi de conformité](authserver-conformite.md). Les tests multi-processus, le redémarrage et la rotation utilisent un client OAuth et une copie des clés réservés aux tests. Ils ne réinitialisent pas les bases.
