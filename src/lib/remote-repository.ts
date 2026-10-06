import { financeSchema, type FinanceData } from "./finance";
import { StorageConflictError, type FinanceRepository } from "./repository";

export class RemoteFinanceRepository implements FinanceRepository {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request(init?: RequestInit): Promise<FinanceData> {
    let response: Response;
    try {
      response = await this.fetcher("/api/finance", { ...init, cache: "no-store", credentials: "same-origin" });
    } catch {
      throw new Error("Sem conexão com sua conta. Verifique a internet e tente novamente; a alteração não foi salva.");
    }
    if (response.status === 409) throw new StorageConflictError();
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Não foi possível salvar na sua conta. Tente novamente.");
    }
    return financeSchema.parse(await response.json());
  }

  read() { return this.request(); }

  write(data: FinanceData, expectedRevision: number) {
    return this.request({
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...financeSchema.parse(data), revision: expectedRevision }, expectedRevision }),
    });
  }

  async restore(data: FinanceData) {
    const current = await this.read();
    return this.write(data, current.revision);
  }
}
