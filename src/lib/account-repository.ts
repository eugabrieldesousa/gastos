import { z } from "zod";
import { financeSchema, parseFinanceData, type FinanceData } from "./finance";
import { RemoteFinanceRepository } from "./remote-repository";
import { StorageConflictError, type FinanceRepository } from "./repository";
import { financeSnapshotHash, financeSnapshotString } from "./finance-snapshot";

const storedDocument = z.unknown().transform((value) => parseFinanceData(value));
const cacheSchema = z.object({
  version: z.literal(1),
  accountId: z.string(),
  data: storedDocument,
  base: storedDocument,
  pending: z.boolean(),
  upload: storedDocument.nullable(),
  conflict: storedDocument.nullable(),
  lastSyncedAt: z.string().nullable(),
  operation: z.enum(["edit", "clear", "restore"]),
  resetGeneration: z.number().int().nonnegative().default(0),
  recovery: z.array(z.object({ id: z.string(), date: z.string(), label: z.string(), data: storedDocument })),
}).strict();
export type AccountCache = z.infer<typeof cacheSchema>;
export type SyncResult = { status: "synced" | "conflict"; cache: AccountCache };
const sameContent = (a: FinanceData, b: FinanceData) => financeSnapshotString({ ...a, revision: 0 }) === financeSnapshotString({ ...b, revision: 0 });
const sameSnapshot = (a: FinanceData, b: FinanceData) => a.revision === b.revision && sameContent(a, b);

/** One durable working copy per account. Local revisions never serve as remote revisions. */
export class AccountFinanceRepository implements FinanceRepository {
  readonly key: string;
  private initialization?: Promise<FinanceData>;
  private syncing?: Promise<SyncResult>;
  constructor(
    readonly accountId: string,
    private readonly remote: FinanceRepository = new RemoteFinanceRepository(),
    private readonly storage: () => Pick<Storage, "getItem" | "setItem"> = () => window.localStorage,
  ) { this.key = `orbt.account.${accountId}`; }

  getCache(): AccountCache | null {
    let raw: string | null;
    try { raw = this.storage().getItem(this.key); }
    catch { throw new Error("Não foi possível acessar a cópia local da conta. Verifique as permissões do navegador."); }
    if (raw === null) return null;
    try {
      const cache = cacheSchema.parse(JSON.parse(raw));
      if (cache.accountId !== this.accountId) throw new Error("account");
      return cache;
    } catch { throw new Error("A cópia local da conta está inválida e foi preservada. Não é seguro substituí-la automaticamente."); }
  }

  private persist(cache: AccountCache): AccountCache {
    const valid = cacheSchema.parse(cache);
    try { this.storage().setItem(this.key, JSON.stringify(valid)); }
    catch { throw new Error("Não foi possível salvar neste aparelho. Os dados anteriores foram preservados. Verifique o espaço e as permissões do navegador."); }
    return valid;
  }

  private async locked<T>(kind: "local" | "sync", operation: () => Promise<T> | T): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(`${this.key}.${kind}`, async () => operation());
    return operation();
  }

  private requireCache() {
    const cache = this.getCache();
    if (!cache) throw new Error("Carregue os dados da conta antes de editar.");
    return cache;
  }

  async read(): Promise<FinanceData> {
    const cache = this.getCache();
    if (cache) return cache.data;
    if (!this.initialization) this.initialization = this.locked("sync", async () => {
      const existing = this.getCache();
      if (existing) return existing.data;
      const remote = await this.remote.read();
      return this.locked("local", () => {
        const latest = this.getCache();
        if (latest) return latest.data;
        return this.persist({ version: 1, accountId: this.accountId, data: { ...remote, revision: 0 }, base: remote,
          pending: false, upload: null, conflict: null, lastSyncedAt: new Date().toISOString(), operation: "edit", resetGeneration: 0, recovery: [] }).data;
      });
    }).finally(() => { this.initialization = undefined; });
    return this.initialization;
  }

  async write(data: FinanceData, expectedRevision: number, operation: AccountCache["operation"] = "edit") {
    const valid = financeSchema.parse(data);
    return this.locked("local", () => {
      const previous = this.requireCache();
      if (previous.data.revision !== expectedRevision) throw new StorageConflictError();
      const next = { ...valid, revision: expectedRevision + 1 };
      return this.persist({ ...previous, data: next, pending: true, operation,
        resetGeneration: previous.resetGeneration + Number(operation === "clear" || operation === "restore"),
        recovery: operation === "clear" ? [] : previous.recovery }).data;
    });
  }

  async restore(data: FinanceData) { return this.write(data, this.requireCache().data.revision, "restore"); }

  synchronize(): Promise<SyncResult> {
    if (!this.syncing) this.syncing = this.locked("sync", () => this.syncUnlocked()).finally(() => { this.syncing = undefined; });
    return this.syncing;
  }

  private async acknowledge(remote: FinanceData, sent?: FinanceData): Promise<AccountCache> {
    return this.locked("local", () => {
      const cache = this.requireCache();
      // A local edit may arrive after the caller decided that only a pull was needed.
      if (!sent && cache.pending && !sameSnapshot(cache.base, remote))
        return this.persist({ ...cache, conflict: remote });
      const unchanged = sent ? sameSnapshot(cache.data, sent) : !cache.pending;
      const data = unchanged && !sameContent(cache.data, remote) ? { ...remote, revision: cache.data.revision + 1 } : cache.data;
      return this.persist({ ...cache, data, base: remote, upload: null, conflict: null,
        pending: !sameContent(data, remote), lastSyncedAt: new Date().toISOString() });
    });
  }

  private async recordConflict(remote: FinanceData): Promise<SyncResult> {
    const cache = await this.locked("local", () => this.persist({ ...this.requireCache(), conflict: remote }));
    return { status: "conflict", cache };
  }

  private async syncUnlocked(): Promise<SyncResult> {
    this.requireCache();
    let remote = await this.remote.read();
    let cache = this.requireCache();
    // Recover a PUT whose response was lost, including subsequent local edits.
    if (cache.upload && sameContent(cache.upload, remote)) {
      await this.acknowledge(remote, cache.upload);
      cache = this.requireCache();
    }
    if (cache.conflict) return this.recordConflict(remote);
    if (!cache.pending) return this.result(await this.acknowledge(remote));
    if (sameContent(cache.data, remote)) return this.result(await this.acknowledge(remote, cache.data));
    if (!sameSnapshot(cache.base, remote)) return this.recordConflict(remote);
    const sent = cache.data;
    await this.locked("local", () => {
      const latest = this.requireCache();
      this.persist({ ...latest, upload: sent });
    });
    try { remote = await this.remote.write({ ...sent, revision: remote.revision }, remote.revision); }
    catch (cause) {
      if (cause instanceof StorageConflictError) return this.recordConflict(await this.remote.read());
      throw cause;
    }
    await this.acknowledge(remote, sent);
    // Verify the final server state. A concurrent edit is handled by the next sync.
    remote = await this.remote.read();
    cache = this.requireCache();
    if (cache.pending && !sameSnapshot(cache.base, remote)) return this.recordConflict(remote);
    return this.result(await this.acknowledge(remote));
  }

  private result(cache: AccountCache): SyncResult { return { status: cache.conflict ? "conflict" : "synced", cache }; }

  async resolveConflict(choice: "local" | "remote", reviewed: FinanceData): Promise<SyncResult> {
    return this.locked("sync", async () => {
      const remote = await this.remote.read();
      if (await financeSnapshotHash(remote) !== await financeSnapshotHash(reviewed)) return this.recordConflict(remote);
      await this.locked("local", () => {
        const cache = this.requireCache();
        if (!cache.conflict || !sameSnapshot(cache.conflict, reviewed)) throw new StorageConflictError();
        const discarded = choice === "local" ? remote : cache.data;
        const data = choice === "remote" ? { ...remote, revision: cache.data.revision + 1 } : cache.data;
        this.persist({ ...cache, data, base: remote, conflict: null, upload: null, pending: choice === "local",
          resetGeneration: cache.resetGeneration + Number(choice === "remote"),
          recovery: [...cache.recovery, { id: crypto.randomUUID(), date: new Date().toISOString(),
            label: choice === "local" ? "Versão da conta substituída" : "Versão deste aparelho substituída", data: discarded }] });
      });
      return this.syncUnlocked();
    });
  }
}
