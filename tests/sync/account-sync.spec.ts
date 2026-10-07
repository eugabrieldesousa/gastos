import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";
import { navigate } from "../helpers/navigation";

const key = "orbt.account.github:100";
async function login(context: BrowserContext, id = "github:100") {
  const value = await encode({ secret: process.env.ORBT_SYNC_TEST_SECRET!, salt: "authjs.session-token", token: { sub: id, name: "Conta teste" } });
  await context.addCookies([{ name: "authjs.session-token", value, url: "http://127.0.0.1:3004", httpOnly: true, sameSite: "Lax" }]);
}
async function cached(page: Page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key); }
async function addTask(page: Page, text: string) {
  await navigate(page, "TODO"); await page.getByLabel("Nova tarefa", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: text, exact: true })).toBeVisible();
}
async function manualSync(page: Page) {
  await page.getByRole("button", { name: "Sua conta", exact: true }).click();
  await page.getByRole("menuitem", { name: "Atualizar dados da conta", exact: true }).click();
}
function mockServer() {
  let data: FinanceData = { ...emptyFinanceData(), revision: 3 };
  let fail: "none" | "network" | "session" | "lost-response" = "none";
  let writes = 0;
  return { data: () => data, setData: (next: FinanceData) => { data = next; }, fail: (value: typeof fail) => { fail = value; }, writes: () => writes,
    install: async (context: BrowserContext) => {
      await context.route("**/api/finance", async (route) => {
        if (fail === "network") return route.abort("internetdisconnected");
        if (fail === "session") return route.fulfill({ status: 401, json: { error: "Sua sessão expirou. Entre novamente com o GitHub." } });
        const request = route.request();
        if (request.method() === "PUT") {
          const body = request.postDataJSON();
          if (body.expectedRevision !== data.revision) return route.fulfill({ status: 409, json: {} });
          data = { ...body.data, revision: data.revision + 1 }; writes++;
          if (fail === "lost-response") { fail = "none"; return route.abort("failed"); }
        }
        await route.fulfill({ json: data });
      });
    } };
}

test("botão mostra andamento, confirma envio e busca e informa erro de sessão", async ({ page, context }, testInfo) => {
  const server = mockServer(); await server.install(context); await login(context);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/"); await expect(page.getByRole("button", { name: "Sua conta" })).toBeVisible();
  await addTask(page, "Sincronizar tarefa");
  await expect.poll(() => server.data().todos.length).toBe(1); await expect.poll(async () => (await cached(page)).pending).toBe(false);
  // Hold the GET to verify visual progress and prevent duplicate requests.
  let release!: () => void; let started!: () => void;
  const starting = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/finance", async (route) => { started(); await new Promise<void>((resolve) => { release = resolve; }); await route.fulfill({ json: server.data() }); });
  await manualSync(page); await starting;
  await expect(page.getByRole("menuitem", { name: "Sincronizando…", exact: true })).toBeDisabled();
  release(); await expect(page.locator(".account-sync-status")).toContainText("Dados da conta atualizados");
  await expect(page.locator(".account-sync-status")).toContainText("Última sincronização:");
  await expect(page.getByText("Dados da conta atualizados com sucesso.", { exact: true })).toBeVisible();
  await page.unroute("**/api/finance");
  server.setData({ ...server.data(), revision: server.data().revision + 1, todos: [...server.data().todos, {
    id: crypto.randomUUID(), text: "Criada em outro aparelho", completed: true, createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" }] });
  await page.getByRole("menuitem", { name: "Atualizar dados da conta", exact: true }).click();
  await expect.poll(async () => (await cached(page)).data.todos.length).toBe(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("checkbox", { name: "Criada em outro aparelho" })).toBeChecked();
  server.fail("session"); await manualSync(page);
  await expect(page.locator(".account-sync-status")).toContainText("Não foi possível sincronizar");
  await expect(page.locator(".account-sync-status")).toContainText("Sua sessão expirou");
  expect((await cached(page)).data.todos).toHaveLength(2);
  await page.screenshot({ path: `.artifacts/${testInfo.project.name}-conta-feedback.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("offline mantém tarefas e rascunhos ao recarregar, limpa e envia depois", async ({ page, context }) => {
  const server = mockServer(); await server.install(context); await login(context);
  await page.goto("/"); await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  await expect.poll(async () => Boolean((await cached(page))?.lastSyncedAt)).toBe(true);
  await page.evaluate(() => localStorage.setItem("mes.finance.v1", "cópia visitante independente"));
  server.fail("network"); await addTask(page, "Tarefa offline");
  await expect.poll(async () => (await cached(page)).pending).toBe(true);
  await navigate(page, "Notas"); await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.getByLabel("Conteúdo", { exact: true }).fill("Rascunho offline preservado");
  // Preserve pending draft even if the tab reloads before debounce.
  page.on("dialog", (dialog) => dialog.accept()); await page.reload();
  await navigate(page, "Notas"); await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Rascunho offline preservado");
  await navigate(page, "TODO"); await expect(page.getByRole("checkbox", { name: "Tarefa offline" })).toBeVisible();
  server.fail("none"); await manualSync(page);
  await expect(page.locator(".account-sync-status")).toContainText("Dados da conta atualizados");
  expect(server.data().todos).toHaveLength(1); expect(server.data().notes[0].content).toBe("Rascunho offline preservado");
  await page.keyboard.press("Escape"); server.fail("network");
  await page.getByRole("button", { name: "Backup", exact: true }).click(); await page.getByRole("menuitem", { name: "Limpar tudo", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar limpeza", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(async () => (await cached(page)).data.todos.length).toBe(0);
  await expect(page.locator(".workspace-footer")).toContainText("exclusão na conta pendente");
  expect(server.data().todos).toHaveLength(1);
  server.fail("none"); await manualSync(page); await expect.poll(async () => (await cached(page)).pending).toBe(false);
  expect(server.data().todos).toEqual([]); expect(server.data().notes).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("mes.finance.v1"))).toBe("cópia visitante independente");
});

test("conflito preserva versões, exige confirmação e disponibiliza recuperação", async ({ page, context }) => {
  const server = mockServer(); await server.install(context); await login(context);
  await page.goto("/"); await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  server.fail("network"); await addTask(page, "Minha tarefa");
  await expect.poll(async () => (await cached(page)).pending).toBe(true);
  server.setData({ ...server.data(), revision: 4, salaries: { "2026-10": 98765 } }); server.fail("none");
  await manualSync(page);
  await expect(page.getByRole("dialog", { name: "Revisar conflito de sincronização" })).toBeVisible();
  expect((await cached(page)).data.todos[0].text).toBe("Minha tarefa"); expect(server.data().todos).toEqual([]);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Baixar versão deste aparelho" }).click();
  expect((await download).suggestedFilename()).toBe("orbt-conflito-aparelho.json");
  await page.getByRole("button", { name: "Manter dados deste aparelho" }).click();
  await expect(page.getByRole("alertdialog", { name: "Confirmar versão escolhida?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click(); expect(server.data().salaries).toEqual({ "2026-10": 98765 });
  await page.getByRole("button", { name: "Manter dados deste aparelho" }).click(); await page.getByRole("button", { name: "Confirmar substituição", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(server.data().todos[0].text).toBe("Minha tarefa");
  expect((await cached(page)).recovery[0].data.salaries).toEqual({ "2026-10": 98765 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sua conta" }).click(); await page.getByRole("menuitem", { name: "Backups de conflitos" }).click();
  await expect(page.getByRole("dialog", { name: "Backups de conflitos" })).toBeVisible(); await expect(page.getByRole("button", { name: "Baixar backup" })).toBeVisible();
});

test("resposta perdida confirma na próxima busca sem duplicar envio", async ({ page, context }) => {
  const server = mockServer(); await server.install(context); await login(context);
  await page.goto("/"); await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  server.fail("lost-response"); await addTask(page, "Enviar uma vez");
  await expect.poll(() => server.writes()).toBe(1); await expect.poll(async () => (await cached(page)).upload !== null).toBe(true);
  await manualSync(page); await expect.poll(async () => (await cached(page)).pending).toBe(false); expect(server.writes()).toBe(1);
});

test("abas compartilham alterações e limpar tudo cancela rascunho pendente em outra aba", async ({ page, context }) => {
  const server = mockServer(); await server.install(context); await login(context);
  await page.goto("/"); await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  server.fail("network"); await addTask(page, "Compartilhada entre abas");
  const other = await context.newPage(); await other.goto("/"); await navigate(other, "TODO");
  await expect(other.getByRole("checkbox", { name: "Compartilhada entre abas" })).toBeVisible();
  await other.getByRole("checkbox", { name: "Compartilhada entre abas" }).click();
  await expect(other.getByRole("checkbox", { name: "Compartilhada entre abas" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Compartilhada entre abas" })).toBeChecked();
  await navigate(page, "Notas"); await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (target, value) { if (target === key) throw new Error("quota simulada"); original.call(this, target, value); };
  }, key);
  await page.getByLabel("Conteúdo", { exact: true }).fill("Não recriar depois da limpeza");
  await expect(page.getByRole("status")).toContainText("Não foi possível salvar");
  await other.getByRole("button", { name: "Backup", exact: true }).click(); await other.getByRole("menuitem", { name: "Limpar tudo", exact: true }).click();
  await other.getByRole("button", { name: "Confirmar limpeza", exact: true }).click();
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveCount(0);
  await page.reload(); await navigate(page, "Notas"); await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveCount(0);
  expect((await cached(page)).data.notes).toEqual([]); expect((await cached(page)).data.todos).toEqual([]);
  await other.close();
});
