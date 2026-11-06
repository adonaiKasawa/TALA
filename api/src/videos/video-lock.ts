import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
// A deletion waits for preceding writes, then removes their dependent rows.
// A write that follows deletion must fail before recreating dependent data.
export async function lockActiveVideo(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT "id" FROM "Video" WHERE "id" = ${id} AND "status" <> 'deleted' FOR SHARE`;
  if (!rows.length) throw new NotFoundException('Vidéo indisponible.');
}
