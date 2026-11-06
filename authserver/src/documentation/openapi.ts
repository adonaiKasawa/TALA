import type { OpenAPIObject } from '@nestjs/swagger';

type Schema = Record<string, unknown>;
const text = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const password = text({ format: 'password', writeOnly: true, maxLength: 128 });
const email = text({ format: 'email', maxLength: 254 });
const code = text({ minLength: 6, maxLength: 64 });
const token = text({ minLength: 43, maxLength: 43 });

export function openApi(issuer: string): OpenAPIObject {
  const paths: Record<string, Record<string, unknown>> = {};
  const add = (
    method: string,
    path: string,
    summary: string,
    protectedRoute = true,
    properties?: Record<string, Schema>,
    required: string[] = [],
  ) => {
    const parameters: Schema[] = [...path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => ({
        name: match[1],
        in: 'path',
        required: true,
        schema: text(),
      }),
    );
    if (method !== 'get')
      parameters.push({
        name: 'X-CSRF-Token',
        in: 'header',
        required: !protectedRoute,
        description:
          'Valeur de GET /account/csrf, avec les cookies conservés. Obligatoire si authentification par cookie ; facultatif avec un Bearer valide.',
        schema: text(),
      });
    const operation: Schema = {
      summary,
      tags: [path.startsWith('/admin') ? 'Administration' : 'Identité'],
      description: path.startsWith('/admin')
        ? 'Audience identité, client OAuth autorisé par AUTH_ADMIN_CLIENT_IDS, scopes tala.identity et tala.admin, rôle administrateur et MFA TOTP de moins de 5 minutes requis.'
        : undefined,
      security: protectedRoute ? [{ Bearer: [] }, { ConsoleSession: [] }] : [],
      parameters,
      responses: {
        [method === 'post' ? '201' : '200']: {
          description: 'Opération réussie',
        },
        '400': { description: 'Données ou action invalides' },
        '401': { description: 'Authentification requise' },
        '403': {
          description:
            'Permission, preuve MFA ou protection CSRF insuffisante ; limite atteinte',
        },
        '409': { description: 'Informations indisponibles' },
      },
    };
    if (properties)
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties, required },
          },
        },
      };
    (paths[path] ??= {})[method] = operation;
  };
  add('get', '/health/live', 'Disponibilité du processus', false);
  add('get', '/health/ready', 'Disponibilité de PostgreSQL', false);
  add(
    'get',
    '/account/csrf',
    'Obtenir un jeton CSRF et son cookie signé',
    false,
  );
  add(
    'post',
    '/account/register',
    'Créer un compte',
    false,
    {
      email,
      username: text({
        minLength: 3,
        maxLength: 40,
        pattern: '^[a-zA-Z0-9_.-]+$',
      }),
      password: { ...password, minLength: 12 },
    },
    ['email', 'username', 'password'],
  );
  add(
    'post',
    '/account/email/request',
    'Demander un lien de vérification',
    false,
    { email },
    ['email'],
  );
  add('post', '/account/email/confirm', 'Vérifier un email', false, { token }, [
    'token',
  ]);
  add(
    'post',
    '/account/password/request',
    'Demander un lien de récupération',
    false,
    { email },
    ['email'],
  );
  add(
    'post',
    '/account/password/reset',
    'Réinitialiser un mot de passe',
    false,
    { token, password: { ...password, minLength: 12 } },
    ['token', 'password'],
  );
  add('get', '/account/me', 'Lire mon profil');
  add(
    'patch',
    '/account/me',
    'Modifier mon pseudonyme',
    true,
    { username: text({ minLength: 3, maxLength: 40 }) },
    ['username'],
  );
  add(
    'delete',
    '/account/me',
    'Supprimer mon compte après réauthentification',
    true,
    { password },
  );
  add(
    'post',
    '/account/password/change',
    'Changer ou définir mon mot de passe',
    true,
    { currentPassword: password, password: { ...password, minLength: 12 } },
    ['password'],
  );
  add(
    'post',
    '/account/mfa/enroll',
    'Préparer la MFA TOTP après réauthentification',
    true,
    { password },
  );
  add(
    'post',
    '/account/mfa/confirm',
    'Activer la MFA et recevoir les codes de secours',
    true,
    { code },
    ['code'],
  );
  add(
    'post',
    '/account/mfa/disable',
    'Désactiver la MFA après réauthentification',
    true,
    { password, code },
    ['code'],
  );
  add(
    'post',
    '/account/mfa/recovery-codes',
    'Renouveler les codes de secours',
    true,
    { password, code },
    ['code'],
  );
  add('get', '/account/sessions', 'Lister mes sessions');
  add('delete', '/account/sessions/{id}', 'Révoquer une de mes sessions');
  add('post', '/account/sessions/revoke-all', 'Révoquer toutes mes sessions');
  add('get', '/account/grants', 'Lister mes consentements');
  add('delete', '/account/grants/{id}', 'Révoquer un consentement');
  add('get', '/account/export', 'Exporter mes données d’identité sans secrets');
  add(
    'get',
    '/federation/providers',
    'Lister les fournisseurs configurés',
    false,
  );
  add(
    'post',
    '/account/reauthenticate',
    'Confirmer mon identité avant une opération coordonnée',
    true,
    { password },
  );
  add('get', '/account/identities', 'Lister mes comptes externes associés');
  add(
    'post',
    '/account/identities/{provider}/link',
    'Associer un fournisseur après réauthentification',
    true,
    {
      password,
      browser: {
        type: 'boolean',
        description:
          'Demander un relais navigateur à usage unique pour un client applicatif autorisé.',
      },
    },
  );
  add(
    'delete',
    '/account/identities/{provider}',
    'Retirer une association sans supprimer le dernier moyen de connexion',
    true,
    { password },
  );
  add('get', '/admin/users', 'Lister les comptes');
  add('patch', '/admin/users/{id}', 'Modifier rôle ou statut', true, {
    active: { type: 'boolean' },
    role: text({
      enum: ['viewer', 'creator', 'professional', 'moderator', 'admin'],
    }),
  });
  add('get', '/admin/clients', 'Lister les clients sans secrets');
  add(
    'post',
    '/admin/clients',
    'Enregistrer un client OAuth',
    true,
    {
      client_id: text(),
      client_name: text(),
      kind: text({ enum: ['public', 'confidential', 'service'] }),
      application_type: text({ enum: ['web', 'native'] }),
      redirect_uris: {
        type: 'array',
        items: text({ format: 'uri' }),
        maxItems: 10,
      },
      post_logout_redirect_uris: {
        type: 'array',
        items: text({ format: 'uri' }),
        maxItems: 10,
      },
      scope: text(),
    },
    ['client_id', 'client_name', 'kind'],
  );
  add(
    'delete',
    '/admin/clients/{id}',
    'Supprimer un client et ses consentements',
  );
  add('get', '/admin/audit', 'Lire les derniers événements');
  add(
    'post',
    '/account/type',
    'Choisir spectateur, créateur ou professionnel ; reconnexion ensuite',
    true,
    { role: text({ enum: ['viewer', 'creator', 'professional'] }) },
    ['role'],
  );
  add(
    'post',
    '/account/phone/challenge',
    'Vérifier un numéro E.164 après réauthentification ; SMS désactivé par défaut',
    true,
    {
      phone: text({ pattern: '^\\+[1-9]\\d{7,14}$' }),
      password,
      mfaCode: code,
    },
    ['phone'],
  );
  add(
    'put',
    '/account/phone',
    'Associer le numéro après vérification OTP',
    true,
    {
      challengeId: text({ format: 'uuid' }),
      code: text({ pattern: '^\\d{6}$' }),
    },
    ['challengeId', 'code'],
  );
  add(
    'delete',
    '/account/phone',
    'Dissocier son téléphone après réauthentification',
    true,
    { password, mfaCode: code },
  );
  add(
    'post',
    '/account/step-up',
    'Preuve MFA TOTP à usage unique pour une opération de retrait (aucun mouvement financier)',
    true,
    {
      password,
      code,
      purpose: text({ enum: ['withdrawal'] }),
      contextHash: text({ pattern: '^[a-f0-9]{64}$' }),
    },
    ['code', 'purpose', 'contextHash'],
  );
  add(
    'post',
    '/interaction/{uid}/phone/challenge',
    'Demander un OTP dans une interaction OAuth existante ; cookie et CSRF requis',
    false,
    { phone: text({ pattern: '^\\+[1-9]\\d{7,14}$' }) },
    ['phone'],
  );
  add(
    'post',
    '/interaction/{uid}/phone/login',
    'Terminer la connexion SMS puis MFA si activée ; cookie et CSRF requis',
    false,
    {
      challengeId: text({ format: 'uuid' }),
      code: text({ pattern: '^\\d{6}$' }),
      mfaCode: code,
    },
    ['challengeId', 'code'],
  );
  return {
    openapi: '3.1.0',
    info: {
      title: 'TALA AuthServer REST',
      version: '0.1.0',
      description:
        'Gestion de l’identité. Les endpoints de protocole OAuth/OIDC sont décrits par /.well-known/openid-configuration. Les mots de passe de réauthentification restent requis pour les comptes locaux ; les comptes exclusivement fédérés utilisent une connexion récente.',
    },
    servers: [{ url: issuer }],
    paths,
    components: {
      securitySchemes: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Access token TALA destiné à IDENTITY_AUDIENCE (urn:tala:identity par défaut), avec le scope tala.identity ; jamais un ID token. Les routes admin exigent aussi tala.admin.',
        },
        ConsoleSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'tala_review',
          description:
            'Session de la console locale, avec CSRF pour les écritures.',
        },
      },
    },
  };
}
