import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";
import { GitHubFinanceStore } from "../../src/lib/github-store";
import { StorageConflictError } from "../../src/lib/repository";
import { CloudStoreError } from "../../src/lib/cloud-store";
import { financeSnapshotHash } from "../../src/lib/finance-snapshot";

const user = "github:112009770";
const config = { repository: "eugabrieldesousa/gastos-dados", token: "private-test-token" };
const head = "a".repeat(40);
const blob = "b".repeat(40);
const metadata = { private: true, owner: { type: "User", id: 112009770 }, default_branch: "main" };
const ref = { object: { type: "commit", sha: head } };
const confirmation = { commit: { sha: "c".repeat(40) }, content: { sha: "d".repeat(40) } };
const emptyHash = await financeSnapshotHash(emptyFinanceData());

function document(data: FinanceData) {
  return { type: "file", sha: blob, encoding: "base64", content: Buffer.from(JSON.stringify(data)).toString("base64") };
}
function setup(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  return { fetcher, store: new GitHubFinanceStore(() => config, fetcher) };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("dados financeiros em GitHub privado", () => {
  it("lê a conta proprietária, fixando o arquivo ao commit da branch", async () => {
    const data = { ...emptyFinanceData(), revision: 4, salaries: { "2026-10": 500000 } };
    const { store, fetcher } = setup(json(metadata), json(ref), json(document(data)));
    expect(await store.read(user)).toEqual(data);
    expect(fetcher.mock.calls[1][0]).toBe("https://api.github.com/repos/eugabrieldesousa/gastos-dados/git/ref/heads/main");
    expect(fetcher.mock.calls[2][0]).toBe(`https://api.github.com/repos/eugabrieldesousa/gastos-dados/contents/data/112009770/finance.json?ref=${head}`);
    expect(fetcher.mock.calls[2][1]?.cache).toBe("no-store");
    expect(fetcher.mock.calls[2][1]?.redirect).toBe("error");
  });
  it("recusa outra conta antes de consultar qualquer arquivo financeiro", async () => {
    const { store, fetcher } = setup(json(metadata));
    try { await store.read("github:999"); throw new Error("Expected access denial"); }
    catch (cause) { expect(cause).toBeInstanceOf(CloudStoreError); expect((cause as CloudStoreError).status).toBe(403); }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recusa gravações em repositório público sem consultar nem escrever o arquivo", async () => {
    const { store, fetcher } = setup(json({ ...metadata, private: false }));
    await expect(store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toThrow("precisa ser privado");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("não trata repositório inacessível ou branch ausente como dados vazios", async () => {
    const denied = setup(json({}, 404));
    await expect(denied.store.read(user)).rejects.toBeInstanceOf(CloudStoreError);
    const missingBranch = setup(json(metadata), json({}, 404));
    await expect(missingBranch.store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toBeInstanceOf(CloudStoreError);
    expect(missingBranch.fetcher).toHaveBeenCalledTimes(2);
  });
  it("cria o primeiro arquivo e confirma o commit antes de informar sucesso", async () => {
    const { store, fetcher } = setup(json(metadata), json(ref), json({}, 404), json(confirmation, 201));
    const data = { ...emptyFinanceData(), salaries: { "2026-10": 54321 } };
    const saved = await store.write(user, data, 0, emptyHash);
    expect(saved.revision).toBe(1);
    const [, options] = fetcher.mock.calls[3];
    const body = JSON.parse(options?.body as string);
    expect(options?.method).toBe("PUT");
    expect(body).toMatchObject({ branch: "main", message: "mês.: salvar dados financeiros (revisão 1)" });
    expect(body.sha).toBeUndefined();
    expect(JSON.parse(Buffer.from(body.content, "base64").toString("utf8"))).toEqual(saved);
    expect(JSON.stringify(saved)).not.toContain(config.token);
  });
  it("inclui o SHA do arquivo ao atualizar e recusa revisão antiga sem PUT", async () => {
    const data = { ...emptyFinanceData(), revision: 2 };
    const current = setup(json(metadata), json(ref), json(document(data)), json(confirmation));
    expect((await current.store.write(user, data, 2, await financeSnapshotHash(data))).revision).toBe(3);
    expect(JSON.parse(current.fetcher.mock.calls[3][1]?.body as string).sha).toBe(blob);
    const outdated = setup(json(metadata), json(ref), json(document(data)));
    await expect(outdated.store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toBeInstanceOf(StorageConflictError);
    expect(outdated.fetcher).toHaveBeenCalledTimes(3);
  });
  it("propaga conflito do GitHub sem tentar forçar outro commit", async () => {
    const data = { ...emptyFinanceData(), revision: 2 };
    const { store, fetcher } = setup(json(metadata), json(ref), json(document(data)), json({}, 409));
    await expect(store.write(user, data, 2, await financeSnapshotHash(data))).rejects.toBeInstanceOf(StorageConflictError);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("identifica criação concorrente quando GitHub retorna 422 por falta do SHA", async () => {
    const { store, fetcher } = setup(
      json(metadata), json(ref), json({}, 404), json({}, 422),
      json(metadata), json(ref), json(document({ ...emptyFinanceData(), revision: 1 })),
    );
    await expect(store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toBeInstanceOf(StorageConflictError);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });
  it("lê arquivos maiores pelo formato raw mantendo o mesmo commit", async () => {
    const data = { ...emptyFinanceData(), revision: 3 };
    const { store, fetcher } = setup(json(metadata), json(ref), json({ type: "file", sha: blob, encoding: "none", content: "" }), new Response(JSON.stringify(data)));
    expect(await store.read(user)).toEqual(data);
    expect(fetcher.mock.calls[3][0]).toBe(fetcher.mock.calls[2][0]);
    expect(fetcher.mock.calls[3][1]?.headers).toMatchObject({ Accept: "application/vnd.github.raw+json" });
  });
  it("preserva arquivo corrompido sem gravar por cima", async () => {
    const broken = { type: "file", sha: blob, encoding: "base64", content: Buffer.from("invalid").toString("base64") };
    const { store, fetcher } = setup(json(metadata), json(ref), json(broken));
    await expect(store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toThrow("foi preservado");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("diferencia limites e não revela respostas privadas nem tokens em erros", async () => {
    const limited = setup(new Response("private upstream data", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    await expect(limited.store.read(user)).rejects.toThrow("limite de solicitações");
    const forbidden = setup(json({ message: config.token }, 401));
    await expect(forbidden.store.read(user)).rejects.not.toThrow(config.token);
    const unknown = setup(json(metadata), json(ref), json({}, 404), json({ content: {} }, 201));
    await expect(unknown.store.write(user, emptyFinanceData(), 0, emptyHash)).rejects.toBeInstanceOf(CloudStoreError);
  });
  it("detecta edição feita diretamente no GitHub mesmo com a revisão numérica inalterada", async () => {
    const old = { ...emptyFinanceData(), revision: 5, salaries: { "2026-10": 10000 } };
    const edited = { ...old, salaries: { "2026-10": 20000 } };
    const { store, fetcher } = setup(json(metadata), json(ref), json(document(edited)));
    await expect(store.write(user, old, 5, await financeSnapshotHash(old))).rejects.toBeInstanceOf(StorageConflictError);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const reordered = { ...Object.fromEntries(Object.entries(old).reverse()), ...old };
    expect(await financeSnapshotHash(reordered)).toBe(await financeSnapshotHash(old));
  });
});
