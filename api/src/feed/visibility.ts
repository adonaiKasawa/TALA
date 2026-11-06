import type { Prisma } from '../generated/prisma/client.js';
export function profileVisibility(
  viewer?: string,
  excluded: string[] = [],
): Prisma.ProfileWhereInput {
  return {
    suspended: false,
    id: { notIn: excluded },
    OR: [
      { isPrivate: false },
      ...(viewer
        ? [
            { id: viewer },
            { relationsTo: { some: { fromId: viewer, kind: 'follow' } } },
          ]
        : []),
    ],
  };
}
