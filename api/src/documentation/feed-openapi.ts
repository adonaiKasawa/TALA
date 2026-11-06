import type {
  OpenAPIObject,
  OperationObject,
  SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { commentBody, impressionBody, watchBody } from '../feed/feed.schema.js';
import { captionBody } from '../videos/captions.service.js';
export function feedPaths(): OpenAPIObject['paths'] {
  const op = (
    summary: string,
    schema?: z.ZodType,
    names: string[] = [],
    anonymous = false,
  ): OperationObject => ({
    tags: ['Visionnage et communauté'],
    summary,
    security: anonymous ? [] : [{ Bearer: [] }],
    parameters: names.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    })),
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: z.toJSONSchema(schema) as unknown as SchemaObject,
              },
            },
          },
        }
      : {}),
    responses: {
      '200': { description: 'Opération réussie' },
      '201': { description: 'Création réussie' },
      '400': { description: 'Paramètres invalides' },
      '401': { description: 'Connexion et profil requis' },
      '404': { description: 'Ressource indisponible' },
      '429': { description: 'Limite de requêtes' },
    },
  });
  return {
    '/me/library': {
      get: {
        ...op(
          'Vidéos, republications et favoris privés en grille ; compteurs cumulatifs',
        ),
        parameters: [
          {
            name: 'tab',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['videos', 'reposts', 'favorites'],
            },
          },
        ],
      },
    },
    '/me/conversations': {
      get: op('Boîte des conversations privées et non lus'),
      post: op(
        'Ouvrir une conversation individuelle',
        z.object({ username: z.string().min(3).max(30) }),
      ),
    },
    '/conversations/{id}/messages': {
      get: {
        ...op('Messages réservés aux participants, 50 par page', undefined, [
          'id',
        ]),
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'before',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
      },
      post: op(
        'Envoyer un texte, idempotence par clientId, 20/minute',
        z.object({
          text: z.string().trim().min(1).max(2000),
          clientId: z.uuid(),
        }),
        ['id'],
      ),
    },
    '/conversations/{id}/read': {
      put: op('Marquer les messages reçus comme lus', undefined, ['id']),
    },
    '/feed': {
      get: {
        ...op(
          'Fil chronologique public, Abonnements ou favoris ; Bearer optionnel pour le fil public',
          undefined,
          [],
          true,
        ),
        parameters: [
          {
            name: 'kind',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['short', 'long'],
              default: 'short',
            },
          },
          {
            name: 'mode',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['latest', 'following', 'saved'],
              default: 'latest',
            },
          },
          ...[
            'cursor',
            'creator',
            'tag',
            'video',
            'category',
            'language',
            'country',
          ].map((name) => ({
            name,
            in: 'query' as const,
            schema: { type: 'string' as const },
          })),
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
        ],
      },
    },
    '/videos/{id}/social': {
      get: op(
        'Compteurs et état personnel ; Bearer optionnel',
        undefined,
        ['id'],
        true,
      ),
    },
    '/videos/{id}/reactions/{kind}': {
      put: op(
        'Activer like, save ou not_interested, de façon idempotente',
        undefined,
        ['id', 'kind'],
      ),
      delete: op('Retirer une réaction', undefined, ['id', 'kind']),
    },
    '/creators/{username}/relations/{kind}': {
      put: op('Activer follow, block, mute ou restrict', undefined, [
        'username',
        'kind',
      ]),
      delete: op('Retirer une relation', undefined, ['username', 'kind']),
    },
    '/creators/{username}/{list}': {
      get: op(
        'Liste publique followers ou following, 100 profils maximum',
        undefined,
        ['username', 'list'],
        true,
      ),
    },
    '/videos/{id}/comments': {
      get: {
        ...op(
          'Commentaires accessibles, curseur chronologique ; Bearer optionnel',
          undefined,
          ['id'],
          true,
        ),
        parameters: [
          ...op('', undefined, ['id']).parameters!,
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
      },
      post: op('Commenter ou répondre à un commentaire racine', commentBody, [
        'id',
      ]),
    },
    '/videos/{id}/comments/{commentId}': {
      delete: op(
        'Supprimer son commentaire ou un commentaire de sa vidéo et ses réponses',
        undefined,
        ['id', 'commentId'],
      ),
    },
    '/watch/impressions': {
      post: op(
        'Enregistrer une exposition réelle, idempotente par UUID client',
        impressionBody,
      ),
    },
    '/watch/{id}': {
      put: op(
        'Enregistrer une mesure cumulative, séquencée et bornée par le temps serveur',
        watchBody,
        ['id'],
      ),
    },
    '/me/history': {
      get: op(
        '50 dernières vidéos distinctes parmi les 200 dernières sessions, rétention 90 jours',
      ),
      delete: op('Effacer son historique et ses événements'),
    },
    '/me/creator-controls': {
      get: op('Consulter les contrôles des créateurs et vidéos masquées'),
    },
    '/videos/{id}/captions/{language}': {
      put: op(
        'Ajouter ou remplacer une piste WebVTT, propriétaire seulement',
        captionBody,
        ['id', 'language'],
      ),
      delete: op('Retirer une piste WebVTT', undefined, ['id', 'language']),
      get: {
        ...op(
          'Lire une piste via une URL signée valable cinq minutes',
          undefined,
          ['id', 'language'],
          true,
        ),
        parameters: [
          ...op('', undefined, ['id', 'language']).parameters!,
          ...['expires', 'signature'].map((name) => ({
            name,
            in: 'query' as const,
            required: true,
            schema: { type: 'string' as const },
          })),
        ],
      },
    },
  };
}
