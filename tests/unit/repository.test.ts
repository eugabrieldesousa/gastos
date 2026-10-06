import { beforeEach, describe, expect, it } from "vitest";
import { emptyFinanceData } from "../../src/lib/finance";
import {
  LocalFinanceRepository,
  STORAGE_KEY,
  StorageConflictError,
} from "../../src/lib/repository";

describe("persistência local", () => {
  let items: Map<string, string>;
  let repository: LocalFinanceRepository;
  beforeEach(() => {
    items = new Map();
    repository = new LocalFinanceRepository(() => ({
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    }));
  });
  it("inicia vazio e preserva os dados entre leituras", async () => {
    expect(await repository.read()).toEqual(emptyFinanceData());
    const saved = await repository.write(
      { ...emptyFinanceData(), salaries: { "2026-10": 500000 } },
      0,
    );
    expect(saved.revision).toBe(1);
    expect(await repository.read()).toEqual(saved);
  });
  it("impede que um estado antigo sobrescreva uma gravação de outra aba", async () => {
    await repository.write(
      { ...emptyFinanceData(), salaries: { "2026-10": 500000 } },
      0,
    );
    await expect(
      repository.write(emptyFinanceData(), 0),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await repository.read()).salaries["2026-10"]).toBe(500000);
  });
  it("preserva documentos inválidos durante leitura e gravação", async () => {
    items.set(STORAGE_KEY, "broken");
    await expect(repository.read()).rejects.toThrow("preservados");
    await expect(repository.write(emptyFinanceData(), 0)).rejects.toThrow();
    expect(items.get(STORAGE_KEY)).toBe("broken");
  });
  it("restaura um documento corrompido somente pela operação de recuperação", async () => {
    items.set(STORAGE_KEY, "broken");
    await repository.restore(emptyFinanceData());
    expect((await repository.read()).revision).toBe(1);
  });
  it("não altera dados anteriores quando o armazenamento falha", async () => {
    const initial = JSON.stringify(emptyFinanceData());
    items.set(STORAGE_KEY, initial);
    const failing = new LocalFinanceRepository(() => ({
      getItem: () => initial,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    }));
    await expect(
      failing.write({ ...emptyFinanceData(), salaries: { "2026-10": 1 } }, 0),
    ).rejects.toThrow("Não foi possível salvar");
    expect(items.get(STORAGE_KEY)).toBe(initial);
    await expect(failing.restore(emptyFinanceData())).rejects.toThrow(
      "não foram alterados",
    );
  });
  it("informa falhas de permissão", async () => {
    const blocked = new LocalFinanceRepository(() => {
      throw new Error("SecurityError");
    });
    await expect(blocked.read()).rejects.toThrow("armazenamento");
  });
  it("migra v1 na leitura e grava v3 sem perder a revisão", async () => {
    const original = JSON.stringify({
      version: 1,
      revision: 12,
      salaries: { "2026-10": 300000 },
      expenses: [],
    });
    items.set(STORAGE_KEY, original);
    const migrated = await repository.read();
    expect(migrated.version).toBe(3);
    expect(migrated.revision).toBe(12);
    expect(items.get(STORAGE_KEY)).toBe(original);
    await repository.write(migrated, 12);
    const saved = JSON.parse(items.get(STORAGE_KEY)!);
    expect(saved.version).toBe(3);
    expect(saved.revision).toBe(13);
    expect(saved.salaries).toEqual({ "2026-10": 300000 });
  });
});
