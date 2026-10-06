import {
  emptyFinanceData,
  financeSchema,
  parseFinanceData,
  type FinanceData,
} from "./finance";

export const STORAGE_KEY = "mes.finance.v1";

export interface FinanceRepository {
  read(): Promise<FinanceData>;
  write(data: FinanceData, expectedRevision: number): Promise<FinanceData>;
  restore(data: FinanceData): Promise<FinanceData>;
}

export class StorageConflictError extends Error {
  constructor() {
    super(
      "Os dados mudaram em outra aba ou dispositivo. Recarregue os dados antes de salvar novamente.",
    );
    this.name = "StorageConflictError";
  }
}

/** Storage is resolved lazily, so importing this module during SSR never touches the browser. */
export class LocalFinanceRepository implements FinanceRepository {
  constructor(
    private readonly getStorage: () => Pick<
      Storage,
      "getItem" | "setItem"
    > = () => window.localStorage,
  ) {}

  private readStored(): FinanceData {
    let raw: string | null;
    try {
      raw = this.getStorage().getItem(STORAGE_KEY);
    } catch {
      throw new Error(
        "Não foi possível acessar os dados deste navegador. Verifique se o armazenamento está permitido e tente novamente.",
      );
    }
    if (raw === null) return emptyFinanceData();
    try {
      return parseFinanceData(JSON.parse(raw));
    } catch {
      throw new Error(
        "Não foi possível ler os dados salvos. Eles foram preservados. Você pode restaurar um backup válido para recuperá-los.",
      );
    }
  }

  async read(): Promise<FinanceData> {
    return this.readStored();
  }

  private async withLock<T>(operation: () => T): Promise<T> {
    if (typeof window !== "undefined" && navigator.locks) {
      return navigator.locks.request(STORAGE_KEY, operation);
    }
    return operation();
  }

  async write(
    data: FinanceData,
    expectedRevision: number,
  ): Promise<FinanceData> {
    const valid = financeSchema.parse(data);
    return this.withLock(() => {
      if (this.readStored().revision !== expectedRevision)
        throw new StorageConflictError();
      const next = { ...valid, revision: expectedRevision + 1 };
      try {
        this.getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          "Não foi possível salvar. Seus dados anteriores continuam intactos. Verifique o espaço e as permissões do navegador e tente novamente.",
        );
      }
      return next;
    });
  }

  /** Only called after explicit confirmation; allows recovery from a corrupt document. */
  async restore(data: FinanceData): Promise<FinanceData> {
    const valid = financeSchema.parse(data);
    return this.withLock(() => {
      let revision = 0;
      try {
        revision = this.readStored().revision;
      } catch {
        /* Recovery may replace an unreadable document. */
      }
      const next = { ...valid, revision: revision + 1 };
      try {
        this.getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          "Não foi possível restaurar o backup. Os dados atuais não foram alterados.",
        );
      }
      return next;
    });
  }
}
