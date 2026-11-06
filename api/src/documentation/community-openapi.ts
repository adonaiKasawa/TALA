import type {
  OpenAPIObject,
  OperationObject,
  SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { discoveryQuery } from '../feed/discovery.service.js';
export function communityPaths(): OpenAPIObject['paths'] {
  const paths: OpenAPIObject['paths'] = {};
  function add(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    summary: string,
    body?: z.ZodType,
    anonymous = false,
  ) {
    const operation: OperationObject = {
      summary,
      tags: ['Comptes, communauté et découverte'],
      security: anonymous ? [{}, { Bearer: [] }] : [{ Bearer: [] }],
      parameters: [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        in: 'path',
        name: m[1],
        required: true,
        schema: {
          type: 'string',
          ...(m[1] === 'username' ? {} : { format: 'uuid' }),
        },
      })),
      ...(body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: z.toJSONSchema(body) as unknown as SchemaObject,
                },
              },
            },
          }
        : {}),
      responses: {
        '200': { description: 'Opération réussie' },
        '201': { description: 'Création réussie' },
        '400': { description: 'Paramètres invalides' },
        '401': { description: 'Identité ou session invalide' },
        '403': { description: 'Permission ou MFA récente requise' },
        '404': { description: 'Ressource absente ou inaccessible' },
        '409': { description: 'Conflit ou traitement en cours' },
        '429': { description: 'Limite atteinte' },
        '503': { description: 'Service dépendant indisponible' },
      },
    };
    paths[path] ??= {};
    paths[path][method] = operation;
  }
  const collection = z.object({ name: z.string().min(1).max(80) }).strict();
  add(
    'get',
    '/me/follow-requests',
    'Demandes reçues, réservées au propriétaire',
  );
  add(
    'put',
    '/me/follow-requests/{id}',
    'Accepter ou refuser une demande ; id du profil demandeur',
    z.object({ accept: z.boolean() }).strict(),
  );
  add(
    'delete',
    '/me/followers/{id}',
    'Retirer un abonné et ses droits de lecture',
  );
  add(
    'put',
    '/videos/{id}/pin',
    'Épingler dans une des trois positions, ou retirer',
    z.object({ rank: z.number().int().min(1).max(3).nullable() }).strict(),
  );
  add(
    'get',
    '/profiles/{username}/pinned',
    'Épingles visibles selon les droits',
    undefined,
    true,
  );
  add(
    'get',
    '/profiles/{username}/reposts',
    'Republications avec attribution de la source',
    undefined,
    true,
  );
  add(
    'put',
    '/videos/{id}/repost',
    'Republier une vidéo publique avec attribution',
  );
  add('delete', '/videos/{id}/repost', 'Retirer sa republication');
  add('get', '/me/collections', 'Lister ses collections privées');
  add(
    'post',
    '/me/collections',
    'Créer une collection privée (50 maximum)',
    collection,
  );
  add(
    'get',
    '/me/collections/{id}',
    'Lire une collection et recontrôler les droits des vidéos',
  );
  add('patch', '/me/collections/{id}', 'Renommer sa collection', collection);
  add('delete', '/me/collections/{id}', 'Supprimer sa collection');
  add(
    'put',
    '/me/collections/{id}/videos/{video}',
    'Ajouter une vidéo (500 maximum)',
  );
  add('delete', '/me/collections/{id}/videos/{video}', 'Retirer une vidéo');
  for (const action of ['like', 'pin']) {
    add(
      'put',
      `/comments/{id}/${action}`,
      action === 'like'
        ? 'Aimer un commentaire'
        : 'Épingler un commentaire de sa vidéo',
    );
    add(
      'delete',
      `/comments/{id}/${action}`,
      'Retirer le ' + action + ' du commentaire',
    );
  }
  add(
    'put',
    '/comments/{id}/video-reply',
    'Associer sa vidéo à un commentaire public visible',
    z.object({ videoId: z.uuid() }).strict(),
  );
  add(
    'get',
    '/videos/{id}/reply-context',
    'Attribution du commentaire source, si toujours visible',
  );
  add('get', '/me/verification', 'État et motifs de sa demande de badge');
  add(
    'post',
    '/me/verification',
    'Soumettre une demande de badge ; liens HTTPS facultatifs',
    z
      .object({
        reason: z.string().min(20).max(2000),
        proofUrls: z.array(z.url()).max(3).default([]),
      })
      .strict(),
  );
  add(
    'get',
    '/moderation/verifications',
    'Modérateur/administrateur avec TOTP de moins de cinq minutes',
  );
  add(
    'put',
    '/moderation/verifications/{id}',
    'Décision unique, auditée et protégée par MFA',
    z
      .object({ approved: z.boolean(), reason: z.string().min(3).max(1000) })
      .strict(),
  );
  add(
    'delete',
    '/moderation/profiles/{id}/verification',
    'Révoquer un badge avec motif et MFA',
    z.object({ reason: z.string().min(3).max(1000) }).strict(),
  );
  add(
    'get',
    '/discover',
    'Pour toi, découverte sociale ou essais ; profil connecté requis',
  );
  const querySchema = z.toJSONSchema(discoveryQuery) as {
    properties: Record<string, SchemaObject>;
  };
  paths['/discover'].get!.parameters = Object.entries(
    querySchema.properties,
  ).map(([name, schema]) => ({ in: 'query', name, required: false, schema }));
  add(
    'get',
    '/search',
    'Rechercher vidéos, créateurs, hashtags et sons visibles',
    undefined,
    true,
  );
  paths['/search'].get!.parameters = [
    {
      in: 'query',
      name: 'q',
      required: true,
      schema: { type: 'string', minLength: 2, maxLength: 100 },
    },
  ];
  add(
    'get',
    '/me/creator-suggestions',
    'Suggestions de créateurs, préférences et petits comptes',
  );
  add(
    'post',
    '/me/discovery/reset',
    'Réinitialiser la personnalisation sans effacer favoris ou abonnements',
  );
  add(
    'get',
    '/discover/trends',
    'Tendances sur sept jours avec visionnages qualifiés',
    undefined,
    true,
  );
  add('get', '/discover/challenges', 'Défis actifs', undefined, true);
  add(
    'post',
    '/moderation/challenges',
    'Créer un défi ; modérateur/administrateur et MFA',
    z
      .object({
        slug: z.string().regex(/^[a-z0-9_-]{3,60}$/),
        title: z.string().min(3).max(120),
        description: z.string().max(2000),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
      })
      .strict(),
  );
  add(
    'post',
    '/videos/{id}/sound',
    'Déclarer le son original et son autorisation de réutilisation',
    z
      .object({
        label: z.string().min(1).max(120),
        reuseAllowed: z.boolean().default(false),
      })
      .strict(),
  );
  add(
    'put',
    '/videos/{id}/discovery-links',
    'Associer un son autorisé et un défi actif',
    z
      .object({
        soundId: z.uuid().nullable().optional(),
        challengeId: z.uuid().nullable().optional(),
      })
      .strict(),
  );
  add(
    'get',
    '/videos/{id}/trial-results',
    'Statistiques agrégées de sa vidéo d’essai',
  );
  add(
    'get',
    '/admin/recommendation-models',
    'Versions et mesures des modèles ; administrateur et MFA',
  );
  add(
    'post',
    '/admin/recommendation-models/train',
    'Entraîner et évaluer chronologiquement ; refuse un corpus insuffisant',
  );
  add(
    'put',
    '/admin/recommendation-models/{id}/active',
    'Activer un modèle seulement s’il dépasse la référence',
  );
  add(
    'delete',
    '/admin/recommendation-models/active',
    'Revenir au classement heuristique',
  );
  add(
    'get',
    '/videos/{id}/download',
    'MP4 signé cinq minutes, seulement si le créateur l’autorise',
    undefined,
    true,
  );
  add(
    'post',
    '/videos/{id}/download/prepare',
    'Préparer explicitement la version MP4 chez Mux, propriétaire uniquement',
  );
  return paths;
}
