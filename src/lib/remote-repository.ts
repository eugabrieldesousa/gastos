import { financeSchema, type FinanceData } from "./finance";
import { StorageConflictError, type FinanceRepository } from "./repository";
import { financeSnapshotHash } from "./finance-snapshot";

export class RemoteFinanceRepository implements FinanceRepository {
  private loaded?: { revision: number; hash: string };
  private generation = 0;
  // Keep the native browser fetch attached to Window, rather than this repository.
  constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

  private async request(init?: RequestInit): Promise<FinanceData> {
    const generation = ++this.generation;
    let response: Response;
    try {
      response = await this.fetcher("/api/finance", { ...init, cache: "no-store", credentials: "same-origin" });
    } catch {
      throw new Error(init?.method === "PUT"
        ? "Não foi possível confirmar o salvamento no GitHub. Verifique a internet e recarregue os dados antes de tentar novamente."
        : "Sem conexão com sua conta. Verifique a internet e recarregue os dados.");
    }
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Não foi possível salvar na sua conta. Tente novamente.");
    }
    const data = financeSchema.parse(await response.json());
    const hash = await financeSnapshotHash(data);
    if (generation === this.generation) this.loaded = { revision: data.revision, hash };
    return data;
  }

  read() { return this.request(); }

  async write(data: FinanceData, expectedRevision: number) {
    if (!this.loaded || this.loaded.revision !== expectedRevision)
      throw new StorageConflictError();
    return this.request({
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...financeSchema.parse(data), revision: expectedRevision }, expectedRevision, expectedSnapshotHash: this.loaded.hash }),
    });
  }

  async restore(data: FinanceData) {
    const current = await this.read();
    return this.write(data, current.revision);
  }
}
