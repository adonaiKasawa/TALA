import type { OpenAPIObject, RequestBodyObject } from '@nestjs/swagger';
import { z } from 'zod';
import { createVideo, patchVideo } from '../videos/video.schema.js';
export function videoPaths(): OpenAPIObject['paths'] {
  const secured = { tags: ['Vidéos'], security: [{ Bearer: [] }] },
    response = {
      '200': { description: 'Opération réussie' },
      '400': { description: 'Fichier ou paramètres invalides' },
      '401': { description: 'Session requise' },
      '404': { description: 'Vidéo indisponible' },
      '409': { description: 'État, quota ou position incompatible' },
      '413': { description: 'Bloc trop volumineux' },
      '429': { description: 'Trop de requêtes' },
      '503': { description: 'Service non configuré' },
    };
  const id = {
    name: 'id',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const, format: 'uuid' },
  };
  const json = (schema: unknown) =>
    ({
      required: true,
      content: { 'application/json': { schema } },
    }) as RequestBodyObject;
  const paths: OpenAPIObject['paths'] = {
    '/me/videos': {
      get: {
        ...secured,
        summary: 'Mes imports et leur état',
        responses: response,
      },
    },
    '/videos/options': {
      get: {
        ...secured,
        summary: 'Limites et mode vidéo',
        responses: response,
      },
    },
    '/videos/public': {
      get: {
        tags: ['Lecture'],
        summary: 'Vidéos publiques publiées de profils publics',
        responses: response,
      },
    },
    '/videos': {
      post: {
        ...secured,
        summary: 'Réserver un import privé et ses quotas',
        requestBody: json(z.toJSONSchema(createVideo)),
        responses: { ...response, '201': { description: 'Import réservé' } },
      },
    },
    '/videos/{id}': {
      get: {
        ...secured,
        summary: 'Consulter mon import',
        parameters: [id],
        responses: response,
      },
      patch: {
        ...secured,
        summary:
          'Titre, description, miniature en secondes, format et visibilité',
        parameters: [id],
        requestBody: json(z.toJSONSchema(patchVideo)),
        responses: response,
      },
      delete: {
        ...secured,
        summary: 'Supprimer et programmer le nettoyage',
        parameters: [id],
        responses: response,
      },
    },
    '/videos/{id}/overlay': {
      put: {
        ...secured,
        summary: 'Calque PNG privé du montage, avant la fin de l’import',
        description:
          '4 Mo maximum, de 16 à 4096 pixels par côté et 8 mégapixels maximum. Requiert editRecipe.overlay=true. Immuable après mise en traitement.',
        parameters: [id],
        requestBody: {
          required: true,
          content: {
            'image/png': { schema: { type: 'string', format: 'binary' } },
          },
        },
        responses: {
          ...response,
          '413': { description: 'Calque trop volumineux' },
        },
      },
    },
    '/videos/{id}/content': {
      put: {
        ...secured,
        summary: 'Envoyer un bloc reprenable de 4 Mio maximum',
        parameters: [
          id,
          {
            name: 'Upload-Offset',
            in: 'header',
            required: true,
            schema: { type: 'integer', minimum: 0 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        responses: response,
      },
    },
    '/videos/{id}/playback': {
      get: {
        tags: ['Lecture'],
        summary:
          'Contrôler les droits et obtenir une lecture signée pendant 5 minutes',
        description:
          'Token facultatif pour les vidéos publiées publiques/non répertoriées d’un profil public. Les vidéos privées et les aperçus prêts sont réservés au propriétaire.',
        parameters: [id],
        responses: response,
      },
    },
    '/videos/mux/webhook': {
      post: {
        tags: ['Mux'],
        summary:
          'Webhook Mux signé, corps brut, tolérance 5 minutes et déduplication',
        parameters: [
          {
            name: 'Mux-Signature',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '201': { description: 'Événement traité ou déjà reçu' },
          '400': { description: 'Signature ou événement invalide' },
          '503': { description: 'Secret webhook absent' },
        },
      },
    },
  };
  for (const [action, summary] of Object.entries({
    complete: 'Terminer l’envoi et programmer le traitement',
    publish: 'Publier une vidéo prête',
    unpublish: 'Retirer de la publication',
    retry: 'Reprendre un échec transitoire',
  }))
    paths[`/videos/{id}/${action}`] = {
      post: {
        ...secured,
        summary,
        parameters: [id],
        responses: { ...response, '201': { description: 'Opération réussie' } },
      },
    };
  return paths;
}
