import { expect, test, type Page } from "@playwright/test";
import { exampleCosts } from "../fixtures/debt-costs";
import type { FinanceData } from "../../src/lib/finance";

async function nav(page: Page) {
  await page.getByRole("navigation", { name: "Seções do sistema" }).getByRole("button", { name: "Dívidas", exact: true }).click();
}
async function data(page: Page): Promise<FinanceData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!));
}
async function newDebt(page: Page) {
  await page.getByRole("button", { name: "Nova dívida", exact: true }).click();
  await page.getByLabel("Tipo de dívida").selectOption("itemized");
  await page.getByLabel("Nome da dívida").fill("Reparos do carro");
  await page.getByLabel("Descrição geral (opcional)").fill("Manutenção com meu pai");
  await page.getByLabel("Credor", { exact: true }).fill("Pai");
}
async function paste(page: Page, list: string) {
  await page.getByRole("button", { name: "Colar lista", exact: true }).click();
  await page.getByLabel("Lista de custos", { exact: true }).fill(list);
  await page.getByRole("button", { name: "Revisar lista", exact: true }).click();
}
async function saved(page: Page) { await expect(page.getByRole("dialog")).toHaveCount(0); }

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T15:00:00Z") });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  await nav(page);
});

test("lista de custos recolhível, inclusão, edição, exclusão, pagamentos e backup", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newDebt(page);
  await paste(page, exampleCosts);
  await expect(page.getByText("Prévia da lista (14 itens)")).toBeVisible();
  await page.getByRole("button", { name: "Incorporar itens", exact: true }).click();
  await expect(page.locator(".cost-total")).toContainText("2.609,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await saved(page);
  const card = page.locator(".debt-card");
  await expect(card).toContainText("Manutenção com meu pai");
  await expect(card).toContainText("Por custos");
  await expect(card.locator(".debt-cost-row")).toHaveCount(14);
  await expect(card.locator(".debt-cost-row").first()).toBeHidden();
  await expect(card.getByRole("button", { name: "Custos (14)", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator(".debt-cost-list")).toContainText("Graxa/grafite — descrição pouco legível");
  expect((await data(page)).expenses).toEqual([]);
  await page.getByRole("button", { name: "Adicionar custo", exact: true }).click();
  await page.getByLabel("Descrição do custo 1", { exact: true }).fill("Óleo");
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("100,01");
  await page.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await saved(page);
  await expect(card.locator(".debt-metrics")).toContainText("2.709,01");
  const toggle = card.getByRole("button", { name: "Custos (15)", exact: true });
  await toggle.focus(); await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Editar custo Óleo", exact: true }).click();
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("50,01");
  await page.getByRole("button", { name: "Salvar custo", exact: true }).click();
  await saved(page);
  await expect(card.locator(".debt-metrics")).toContainText("2.659,01");
  await page.getByRole("button", { name: "Excluir custo Óleo", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(card.locator(".debt-cost-row")).toHaveCount(15);
  await page.getByRole("button", { name: "Excluir custo Óleo", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir custo", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(card.locator(".debt-cost-row")).toHaveCount(14);
  await page.getByRole("button", { name: "Registrar pagamento", exact: true }).click();
  await page.getByLabel("Valor pago", { exact: true }).fill("609,00");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await saved(page);
  await expect(card.locator(".debt-metrics")).toContainText("2.000,00");
  expect((await data(page)).expenses).toHaveLength(1);
  await page.getByRole("button", { name: "Editar dívida Reparos do carro", exact: true }).click();
  await expect(page.getByLabel("Tipo de dívida")).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.reload(); await nav(page);
  await expect(card.locator(".debt-cost-row")).toHaveCount(14);
  await expect(card.locator(".debt-cost-row").first()).toBeHidden();
  await expect(card.locator(".debt-metrics")).toContainText("2.000,00");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exportar backup", exact: true }).click();
  const file = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(file!, "utf8"));
  expect(backup.debts[0]).toMatchObject({ type: "itemized", originalCents: 260900 });
  expect(backup.debts[0].costs).toHaveLength(14);
  expect(backup.expenses).toHaveLength(1);
  await page.getByLabel("Arquivo de backup").setInputFiles({ name: "custos.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar dados", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(card.locator(".debt-cost-row")).toHaveCount(14);
  expect((await data(page)).debts[0].costs).toEqual(backup.debts[0].costs);
  await card.getByRole("button", { name: "Custos (14)", exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.artifacts/debt-costs-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("edição completa confirma a remoção e só altera os custos ao salvar", async ({ page }) => {
  await newDebt(page);
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("descrição do custo");
  await page.getByLabel("Descrição do custo 1", { exact: true }).fill("Peça");
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("0,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valor positivo");
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("100,00");
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
  await page.getByLabel("Descrição do custo 2", { exact: true }).fill("Óleo");
  await page.getByLabel("Valor do custo 2", { exact: true }).fill("50,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Editar dívida Reparos do carro", exact: true }).click();
  await page.getByRole("button", { name: "Remover custo 2", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".cost-editor-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Remover custo 2", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover custo", exact: true }).click();
  await expect(page.locator(".cost-editor-row")).toHaveCount(1);
  expect((await data(page)).debts[0].costs).toHaveLength(2);
  await page.getByRole("button", { name: "Salvar dívida", exact: true }).click();
  await saved(page);
  expect((await data(page)).debts[0].originalCents).toBe(10000);
  await expect(page.locator(".debt-cost-row")).toHaveCount(1);
});

test("colagem inválida não incorpora parcialmente e a prévia pode ser corrigida", async ({ page }) => {
  await newDebt(page);
  await paste(page, "Guincho 750,00\nSem valor");
  await expect(page.getByRole("alert")).toContainText("linhas 2");
  await expect(page.locator(".cost-list-preview")).toHaveCount(0);
  await expect(page.locator(".cost-editor-rows").first().locator(".cost-editor-row")).toHaveCount(1);
  await page.getByLabel("Lista de custos", { exact: true }).fill("Guincho 750,00\nVistoria 230,00");
  await page.getByRole("button", { name: "Revisar lista", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Incorpore");
  await page.locator(".cost-list-preview").getByLabel("Valor do custo 2", { exact: true }).fill("250,00");
  await page.getByRole("button", { name: "Incorporar itens", exact: true }).click();
  await expect(page.locator(".cost-total")).toContainText("1.000,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await saved(page);
  expect((await data(page)).debts[0].costs).toHaveLength(2);
  expect((await data(page)).expenses).toEqual([]);
});

test("dívida quitada reabre com novo custo e bloqueia exclusão abaixo do pago", async ({ page }) => {
  await newDebt(page);
  await page.getByLabel("Descrição do custo 1", { exact: true }).fill("Peça");
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("100,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Registrar pagamento", exact: true }).click();
  await page.getByLabel("Valor pago", { exact: true }).fill("100,00");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await saved(page);
  await expect(page.locator(".debt-forecast")).toHaveText("Quitada");
  await expect(page.getByRole("button", { name: "Registrar pagamento", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Adicionar custo", exact: true }).click();
  await page.getByLabel("Descrição do custo 1", { exact: true }).fill("Óleo");
  await page.getByLabel("Valor do custo 1", { exact: true }).fill("50,00");
  await page.getByRole("button", { name: "Salvar custos", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("button", { name: "Registrar pagamento", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Custos (2)", exact: true }).click();
  await page.getByRole("button", { name: "Excluir custo Peça", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir custo", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toContainText("pagamentos");
  expect((await data(page)).debts[0].costs).toHaveLength(2);
  expect((await data(page)).expenses).toHaveLength(1);
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
