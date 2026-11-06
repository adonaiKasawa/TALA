import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { Database } from '../../database/database.service.js';
import type { Vault } from '../../security/crypto.js';
export function adapterFactory(
  db: Database,
  vault: Vault,
): new (model: string) => Adapter {
  return class PostgresAdapter implements Adapter {
    constructor(private model: string) {}
    async upsert(id: string, p: AdapterPayload, expiresIn: number) {
      const data = {
        payload: vault.seal(p),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        accountId: typeof p.accountId === 'string' ? p.accountId : null,
        grantId: typeof p.grantId === 'string' ? p.grantId : null,
        sessionUid: typeof p.sessionUid === 'string' ? p.sessionUid : null,
        uid: typeof p.uid === 'string' ? p.uid : null,
        userCode: typeof p.userCode === 'string' ? p.userCode : null,
      };
      await db.oidcArtifact.upsert({
        where: { model_id: { model: this.model, id } },
        create: { model: this.model, id, ...data },
        update: data,
      });
    }
    private async lookup(where: Record<string, unknown>) {
      const row = await db.oidcArtifact.findFirst({
        where: {
          model: this.model,
          ...where,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!row) return undefined;
      const payload = vault.open<AdapterPayload>(row.payload);
      if (row.consumedAt)
        payload.consumed = Math.floor(row.consumedAt.getTime() / 1000);
      return payload;
    }
    find(id: string) {
      return this.lookup({ id });
    }
    findByUid(uid: string) {
      return this.lookup({ uid });
    }
    findByUserCode(userCode: string) {
      return this.lookup({ userCode });
    }
    async destroy(id: string) {
      await db.oidcArtifact.deleteMany({ where: { model: this.model, id } });
    }
    async consume(id: string) {
      const result = await db.oidcArtifact.updateMany({
        where: { model: this.model, id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (result.count !== 1) throw new Error('Artifact already consumed');
    }
    async revokeByGrantId(grantId: string) {
      await db.oidcArtifact.deleteMany({ where: { grantId } });
    }
  };
}
