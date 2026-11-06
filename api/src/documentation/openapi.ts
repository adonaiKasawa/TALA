import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import { createProfile, updateProfile } from '../profiles/profile.schema.js';
import { videoPaths } from './video-openapi.js';
import { feedPaths } from './feed-openapi.js';
import { communityPaths } from './community-openapi.js';

export function apiDocument(): OpenAPIObject {
  const success = {
    description:
      'Operation reussie. Les preferences ne sont visibles que par le proprietaire.',
  };
  const errors = {
    '400': { description: 'Champs invalides' },
    '401': { description: 'Access token API invalide ou manquant' },
    '403': { description: 'Scope tala.api ou session utilisateur manquants' },
    '404': { description: 'Profil introuvable' },
    '409': { description: 'Pseudonyme indisponible ou profil deja cree' },
    '429': { description: 'Limite de requetes atteinte' },
  };
  const secured = { security: [{ Bearer: [] }], tags: ['Mon profil'] };
  const body = (name: string) => ({
    required: true,
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
    },
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'TALA API',
      version: '0.1.0',
      description:
        'API metier. Les access tokens doivent viser urn:tala:api (API_AUDIENCE configurable), porter tala.api et provenir d’une session utilisateur. Les ID tokens, tokens identite et Client Credentials ne donnent pas acces aux profils personnels.',
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      ...videoPaths(),
      ...feedPaths(),
      ...communityPaths(),
      '/health/live': {
        get: { tags: ['Disponibilite'], responses: { '200': success } },
      },
      '/health/ready': {
        get: {
          tags: ['Disponibilite'],
          responses: {
            '200': success,
            '500': { description: 'PostgreSQL indisponible' },
          },
        },
      },
      '/me/profile': {
        get: {
          ...secured,
          summary: 'Consulter mon profil et mes preferences',
          responses: { '200': success, ...errors },
        },
        post: {
          ...secured,
          summary: 'Creer mon profil',
          requestBody: body('CreateProfile'),
          responses: { '201': success, ...errors },
        },
        patch: {
          ...secured,
          summary: 'Modifier les champs de mon profil',
          requestBody: body('UpdateProfile'),
          responses: { '200': success, ...errors },
        },
        delete: {
          ...secured,
          summary: 'Supprimer mon profil metier',
          description:
            'Suppression idempotente. Ne supprime pas les identifiants de connexion de l’AuthServer.',
          responses: { '200': success, ...errors },
        },
      },
      '/profiles/{username}': {
        get: {
          tags: ['Profils publics'],
          summary: 'Consulter un profil par pseudonyme',
          description:
            'Sans token : resume uniquement si compte prive ; bio et liens si public. Les preferences, issuer et sub restent prives. Avec le token du proprietaire : profil complet.',
          parameters: [
            {
              name: 'username',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: { '200': success, ...errors },
        },
      },
    },
    components: {
      securitySchemes: {
        Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        CreateProfile: z.toJSONSchema(createProfile, { io: 'input' }),
        UpdateProfile: z.toJSONSchema(updateProfile, { io: 'input' }),
      } as NonNullable<OpenAPIObject['components']>['schemas'],
    },
  };
}
