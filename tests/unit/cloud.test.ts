import { describe, expect, it, vi } from "vitest";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";
import { financeApi } from "../../src/lib/finance-api";
import type { CloudStore } from "../../src/lib/cloud-store";
import { RemoteFinanceRepository } from "../../src/lib/remote-repository";
import { StorageConflictError } from "../../src/lib/repository";

const origin = "https://gastos.example";
function put(body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/finance`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify(body) });
}
function store(): CloudStore {
  const documents = new Map<string, FinanceData>();
  return {
    read: vi.fn(async (id: string) => documents.get(id) ?? emptyFinanceData()),
    write: vi.fn(async (id: string, data: FinanceData, expected: number) => {
      if ((documents.get(id)?.revision ?? 0) !== expected) throw new StorageConflictError();
      const next = { ...data, revision: expected + 1 };
      documents.set(id, next);
      return next;
    }),
  };
}

describe("API financeira autenticada", () => {
  it("recusa visitantes sem ler ou gravar no banco", async () => {
    const db = store();
    const api = financeApi(db, async () => null);
    expect((await api(new Request(`${origin}/api/finance`))).status).toBe(401);
    expect((await api(put({ data: emptyFinanceData(), expectedRevision: 0 }))).status).toBe(401);
    expect(db.read).not.toHaveBeenCalled();
    expect(db.write).not.toHaveBeenCalled();
  });
  it("usa a identidade da sessão e impede escolher outra conta pelo corpo", async () => {
    const db = store();
    const a = financeApi(db, async () => "github:100");
    const b = financeApi(db, async () => "github:200");
    const data = { ...emptyFinanceData(), salaries: { "2026-10": 12345 } };
    const save = await a(put({ data, expectedRevision: 0 }));
    expect(save.status).toBe(200);
    expect(db.write).toHaveBeenCalledWith("github:100", data, 0);
    expect((await (await b(new Request(`${origin}/api/finance`))).json()).salaries).toEqual({});
    expect((await a(put({ data, expectedRevision: 0, userId: "github:200" }))).status).toBe(400);
    expect(save.headers.get("cache-control")).toBe("private, no-store");
    expect(save.headers.get("vary")).toBe("Cookie");
  });
  it("recusa origem externa, documento inválido e revisão divergente", async () => {
    const db = store();
    const api = financeApi(db, async () => "github:100");
    expect((await api(put({ data: emptyFinanceData(), expectedRevision: 0 }, "https://attacker.example"))).status).toBe(403);
    expect((await api(put({ data: { version: 3 }, expectedRevision: 0 }))).status).toBe(400);
    expect((await api(put({ data: emptyFinanceData(), expectedRevision: 1 }))).status).toBe(400);
    expect(db.write).not.toHaveBeenCalled();
  });
  it("retorna conflito e preserva o primeiro salvamento de dispositivos concorrentes", async () => {
    const db = store();
    const api = financeApi(db, async () => "github:100");
    const first = { ...emptyFinanceData(), salaries: { "2026-10": 80000 } };
    expect((await api(put({ data: first, expectedRevision: 0 }))).status).toBe(200);
    expect((await api(put({ data: emptyFinanceData(), expectedRevision: 0 }))).status).toBe(409);
    expect((await db.read("github:100")).salaries).toEqual(first.salaries);
  });
  it("limita o tamanho e não expõe erros internos do banco", async () => {
    const db = store();
    const api = financeApi(db, async () => "github:100");
    const oversized = put({ data: emptyFinanceData(), expectedRevision: 0 });
    oversized.headers.set("content-length", String(5 * 1024 * 1024));
    expect((await api(oversized)).status).toBe(413);
    vi.mocked(db.read).mockRejectedValue(new Error("postgres://private-credential"));
    const failed = await api(new Request(`${origin}/api/finance`));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private-credential");
  });
});

describe("repositório remoto", () => {
  it("envia a revisão esperada e usa a confirmação do servidor", async () => {
    const data = { ...emptyFinanceData(), revision: 3 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...data, revision: 8 }));
    const saved = await new RemoteFinanceRepository(fetcher).write(data, 7);
    expect(saved.revision).toBe(8);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/finance");
    expect(options?.credentials).toBe("same-origin");
    expect(JSON.parse(options?.body as string)).toMatchObject({ data: { revision: 7 }, expectedRevision: 7 });
  });
  it("informa conflito, sessão expirada e rede indisponível sem gravar localmente", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repo = new RemoteFinanceRepository(fetcher);
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 409 }));
    await expect(repo.write(emptyFinanceData(), 0)).rejects.toBeInstanceOf(StorageConflictError);
    fetcher.mockResolvedValueOnce(Response.json({ error: "Sua sessão expirou." }, { status: 401 }));
    await expect(repo.read()).rejects.toThrow("sessão expirou");
    fetcher.mockRejectedValueOnce(new TypeError("network"));
    await expect(repo.write(emptyFinanceData(), 0)).rejects.toThrow("a alteração não foi salva");
  });
  it("restaura somente a revisão lida e propaga um conflito posterior", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...emptyFinanceData(), revision: 5 }))
      .mockResolvedValueOnce(Response.json({}, { status: 409 }));
    await expect(new RemoteFinanceRepository(fetcher).restore(emptyFinanceData())).rejects.toBeInstanceOf(StorageConflictError);
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string).expectedRevision).toBe(5);
  });
});
