import { describe, expect, it, vi } from "vitest";
import { AccountFinanceRepository } from "../../src/lib/account-repository";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";
import { StorageConflictError, type FinanceRepository } from "../../src/lib/repository";

function setup(initial = { ...emptyFinanceData(), revision: 7 }) {
  let server: FinanceData = structuredClone(initial);
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { items.set(key, value); }) };
  const remote: FinanceRepository = {
    read: vi.fn(async () => structuredClone(server)),
    write: vi.fn(async (data, revision) => {
      if (revision !== server.revision) throw new StorageConflictError();
      server = { ...structuredClone(data), revision: revision + 1 }; return structuredClone(server);
    }),
    restore: vi.fn(),
  };
  const repo = new AccountFinanceRepository("github:100", remote, () => storage);
  return { repo, remote, items, storage, server: () => server, changeServer: (next: FinanceData) => { server = next; },
    reopen: () => new AccountFinanceRepository("github:100", remote, () => storage) };
}
const salary = (data: FinanceData, amount: number) => ({ ...data, salaries: { "2026-10": amount } });

describe("cópia de trabalho e sincronização da conta", () => {
  it("separa revisões locais das revisões remotas e confirma envio e busca", async () => {
    const s = setup(); const local = await s.repo.read();
    expect(local.revision).toBe(0); expect(s.repo.getCache()?.base.revision).toBe(7);
    const saved = await s.repo.write(salary(local, 12000), 0);
    expect(saved.revision).toBe(1); expect(s.server().salaries).toEqual({});
    const result = await s.repo.synchronize();
    expect(result.status).toBe("synced"); expect(result.cache.pending).toBe(false);
    expect(s.server().revision).toBe(8); expect(s.server().salaries).toEqual(saved.salaries);
    expect(result.cache.lastSyncedAt).toBeTruthy();
    expect(s.remote.read).toHaveBeenCalledTimes(3);
  });
  it("não cria revisões locais nem commits em uma sincronização sem mudanças", async () => {
    const s = setup(); const local = await s.repo.read();
    await s.repo.synchronize(); await s.repo.synchronize();
    expect((await s.repo.read()).revision).toBe(local.revision); expect(s.remote.write).not.toHaveBeenCalled();
  });
  it("persiste offline, reabre sem rede e envia mais tarde", async () => {
    const s = setup(); const local = await s.repo.read();
    vi.mocked(s.remote.read).mockRejectedValue(new Error("offline"));
    const saved = await s.repo.write(salary(local, 34567), local.revision);
    await expect(s.repo.synchronize()).rejects.toThrow("offline");
    const reopened = s.reopen(); expect(await reopened.read()).toEqual(saved); expect(reopened.getCache()?.pending).toBe(true);
    vi.mocked(s.remote.read).mockImplementation(async () => structuredClone(s.server()));
    expect((await reopened.synchronize()).cache.pending).toBe(false); expect(s.server().salaries).toEqual(saved.salaries);
  });
  it("sem cópia válida e sem rede não cria uma conta vazia", async () => {
    const s = setup(); vi.mocked(s.remote.read).mockRejectedValue(new Error("offline"));
    await expect(s.repo.read()).rejects.toThrow("offline"); expect(s.items.size).toBe(0);
  });
  it("preserva cópia inválida e não consulta o servidor para substituí-la", async () => {
    const s = setup(); s.items.set(s.repo.key, "broken");
    await expect(s.repo.read()).rejects.toThrow("preservada"); expect(s.items.get(s.repo.key)).toBe("broken"); expect(s.remote.read).not.toHaveBeenCalled();
  });
  it("isola contas e não copia dados da conta para o modo visitante", async () => {
    const s = setup(); const a = await s.repo.read(); await s.repo.write(salary(a, 100), a.revision);
    const other = new AccountFinanceRepository("github:200", { ...s.remote, read: async () => emptyFinanceData() }, () => s.storage);
    expect((await other.read()).salaries).toEqual({}); expect((await s.repo.read()).salaries).toEqual({ "2026-10": 100 });
    expect(s.items.has("mes.finance.v1")).toBe(false);
  });
  it("recusa escrita de uma aba desatualizada", async () => {
    const s = setup(); const data = await s.repo.read(); const tab = s.reopen();
    await s.repo.write(salary(data, 1), data.revision);
    await expect(tab.write(salary(data, 2), data.revision)).rejects.toBeInstanceOf(StorageConflictError);
    expect((await tab.read()).salaries).toEqual({ "2026-10": 1 });
  });
  it("falha de quota não confirma edição nem altera dados anteriores", async () => {
    const s = setup(); const data = await s.repo.read(); const before = s.items.get(s.repo.key);
    s.storage.setItem.mockImplementation(() => { throw new Error("quota"); });
    await expect(s.repo.write(salary(data, 1), data.revision)).rejects.toThrow("preservados");
    expect(s.items.get(s.repo.key)).toBe(before); expect(s.remote.write).not.toHaveBeenCalled();
  });
  it("preserva pendências quando a sessão expira", async () => {
    const s = setup(); const data = await s.repo.read(); const local = await s.repo.write(salary(data, 1), data.revision);
    vi.mocked(s.remote.read).mockRejectedValue(new Error("Sua sessão expirou."));
    await expect(s.repo.synchronize()).rejects.toThrow("sessão expirou");
    expect(await s.reopen().read()).toEqual(local); expect(s.repo.getCache()?.pending).toBe(true);
  });
  it("reconhece um PUT confirmado cuja resposta se perdeu sem repetir o commit", async () => {
    const s = setup(); const data = await s.repo.read(); await s.repo.write(salary(data, 100), data.revision);
    const write = s.remote.write;
    vi.mocked(write).mockImplementationOnce(async (next, revision) => { s.changeServer({ ...next, revision: revision + 1 }); throw new Error("resposta perdida"); });
    await expect(s.repo.synchronize()).rejects.toThrow("resposta perdida");
    expect(s.repo.getCache()?.upload).toBeTruthy();
    const result = await s.reopen().synchronize(); expect(result.cache.pending).toBe(false); expect(write).toHaveBeenCalledTimes(1);
  });
  it("não substitui edição local feita durante o envio", async () => {
    const s = setup(); const data = await s.repo.read(); const first = await s.repo.write(salary(data, 100), data.revision);
    let finish!: () => void; let started!: () => void;
    const starting = new Promise<void>((resolve) => { started = resolve; });
    const original = vi.mocked(s.remote.write).getMockImplementation()!;
    vi.mocked(s.remote.write).mockImplementationOnce(async (next, revision) => { started(); await new Promise<void>((resolve) => { finish = resolve; }); return original(next, revision); });
    const sync = s.repo.synchronize(); await starting;
    await s.repo.write(salary(first, 200), first.revision); finish();
    const result = await sync; expect(result.cache.data.salaries).toEqual({ "2026-10": 200 }); expect(result.cache.pending).toBe(true);
    await s.repo.synchronize(); expect(s.server().salaries).toEqual({ "2026-10": 200 });
  });
  it("compartilha a promessa para cliques simultâneos", async () => {
    const s = setup(); await s.repo.read(); const first = s.repo.synchronize(); expect(s.repo.synchronize()).toBe(first); await first;
  });
  it("busca atualizações remotas quando não há pendências", async () => {
    const s = setup(); await s.repo.read(); s.changeServer({ ...salary(s.server(), 98765), revision: 8 });
    const result = await s.repo.synchronize(); expect(result.cache.data.salaries).toEqual({ "2026-10": 98765 }); expect(s.remote.write).not.toHaveBeenCalled();
  });
  it("guarda conflito após reabrir e nunca sobrescreve o servidor automaticamente", async () => {
    const s = setup(); const data = await s.repo.read(); await s.repo.write(salary(data, 100), data.revision);
    s.changeServer({ ...salary(s.server(), 200), revision: 8 });
    expect((await s.repo.synchronize()).status).toBe("conflict");
    const reopen = s.reopen(); await reopen.read(); expect((await reopen.synchronize()).status).toBe("conflict");
    expect(reopen.getCache()?.data.salaries).toEqual({ "2026-10": 100 }); expect(reopen.getCache()?.conflict?.salaries).toEqual({ "2026-10": 200 });
    expect(s.remote.write).not.toHaveBeenCalled();
  });
  it("detecta alteração direta que mantém a revisão remota", async () => {
    const s = setup(); const data = await s.repo.read(); await s.repo.write(salary(data, 100), data.revision);
    s.changeServer(salary(s.server(), 200)); expect((await s.repo.synchronize()).status).toBe("conflict");
  });
  it.each(["local", "remote"] as const)("resolve escolhendo %s e mantém backup recuperável", async (choice) => {
    const s = setup(); const data = await s.repo.read(); await s.repo.write(salary(data, 100), data.revision);
    s.changeServer({ ...salary(s.server(), 200), revision: 8 }); await s.repo.synchronize();
    const reviewed = s.repo.getCache()!.conflict!;
    const result = await s.repo.resolveConflict(choice, reviewed);
    expect(result.status).toBe("synced"); expect(result.cache.pending).toBe(false);
    expect(s.server().salaries).toEqual({ "2026-10": choice === "local" ? 100 : 200 });
    expect(result.cache.recovery[0].data.salaries).toEqual({ "2026-10": choice === "local" ? 200 : 100 });
    expect(s.reopen().getCache()?.recovery).toEqual(result.cache.recovery);
  });
  it("exige nova revisão quando o servidor muda durante a confirmação", async () => {
    const s = setup(); const data = await s.repo.read(); await s.repo.write(salary(data, 100), data.revision);
    s.changeServer({ ...salary(s.server(), 200), revision: 8 }); await s.repo.synchronize();
    const reviewed = s.repo.getCache()!.conflict!;
    s.changeServer({ ...salary(s.server(), 300), revision: 9 });
    expect((await s.repo.resolveConflict("local", reviewed)).status).toBe("conflict"); expect(s.remote.write).not.toHaveBeenCalled();
    expect(s.repo.getCache()?.conflict?.salaries).toEqual({ "2026-10": 300 });
  });
  it("limpa offline sem alterar modo visitante e aplica a exclusão depois", async () => {
    const s = setup(salary({ ...emptyFinanceData(), revision: 7 }, 100));
    s.items.set("mes.finance.v1", "visitor"); const data = await s.repo.read();
    await s.repo.write(emptyFinanceData(), data.revision, "clear");
    expect(s.repo.getCache()).toMatchObject({ operation: "clear", pending: true, data: { salaries: {}, todos: [], notes: [] } });
    expect(s.items.get("mes.finance.v1")).toBe("visitor"); expect(s.server().salaries).toEqual({ "2026-10": 100 });
    await s.repo.synchronize(); expect(s.server().salaries).toEqual({}); expect(s.repo.getCache()?.pending).toBe(false);
  });
  it("restauração também entra na fila e exige revisão em conflito", async () => {
    const s = setup(); await s.repo.read(); await s.repo.restore(salary(emptyFinanceData(), 100));
    s.changeServer({ ...salary(s.server(), 200), revision: 8 });
    expect((await s.repo.synchronize()).status).toBe("conflict"); expect(s.repo.getCache()?.operation).toBe("restore");
  });
});
