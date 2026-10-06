import { expect, test, type Page } from "@playwright/test";
import { addExpense, emptyFinanceData, saveCard, type FinanceData } from "../../src/lib/finance";
import { saveBankSource } from "../../src/lib/imports";

async function nav(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Seções do sistema" }).getByRole("button", { name, exact: true }).click();
}
async function readData(page: Page): Promise<FinanceData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!));
}
async function upload(page: Page, name: string, content: string | Buffer) {
  await page.getByLabel("Arquivo de extrato").setInputFiles({ name, mimeType: "application/octet-stream", buffer: typeof content === "string" ? Buffer.from(content) : content });
  await page.getByRole("button", { name: "Revisar movimentações" }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toBeVisible();
}
async function createDebt(page: Page) {
  await nav(page, "Dívidas");
  await page.getByRole("button", { name: "Nova dívida", exact: true }).click();
  await page.getByLabel("Nome da dívida").fill("Carro com meu pai");
  await page.getByLabel("Credor", { exact: true }).fill("Pai");
  await page.getByLabel("Valor original", { exact: true }).fill("1.000,00");
  await page.getByLabel("Entrada", { exact: true }).fill("200,00");
  await page.getByLabel("Já pago depois da entrada").fill("100,00");
  await page.getByLabel("Início do acompanhamento").fill("2026-07");
  await page.getByRole("button", { name: "Cadastrar dívida" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-05T15:00:00Z") });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
});

test("dívida com entrada, pagamentos variáveis, média, edição, exclusão e backup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createDebt(page);
  await expect(page.locator(".debt-card")).toContainText("700,00");
  await expect(page.locator(".debt-card")).toContainText("Sem previsão suficiente");
  await page.getByRole("button", { name: "Registrar pagamento", exact: true }).click();
  await page.getByLabel("Valor pago", { exact: true }).fill("100,00");
  await page.getByLabel("Data do pagamento").fill("2026-09-05");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".debt-card")).toContainText("600,00");
  await expect(page.locator(".debt-forecast")).toContainText("abril de 2028");
  await page.getByRole("button", { name: "Registrar pagamento", exact: true }).click();
  await page.getByLabel("Valor pago", { exact: true }).fill("50,00");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".debt-card")).toContainText("550,00");
  const data = await readData(page);
  expect(data.expenses).toHaveLength(2);
  expect(data.expenses.every((e) => e.kind === "debt")).toBe(true);
  await page.locator(".debt-history summary").click();
  await page.getByRole("button", { name: "Editar pagamento Pagamento · Carro com meu pai" }).first().click();
  await page.getByLabel("Valor pago", { exact: true }).fill("800,00");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("saldo");
  expect((await readData(page)).expenses).toEqual(data.expenses);
  await page.getByLabel("Valor pago", { exact: true }).fill("150,00");
  await page.getByRole("button", { name: "Salvar pagamento", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".debt-card")).toContainText("450,00");
  await page.getByRole("button", { name: "Excluir pagamento Pagamento · Carro com meu pai" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir pagamento", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await readData(page)).expenses).toHaveLength(1);
  await page.reload(); await nav(page, "Dívidas");
  await expect(page.locator(".debt-card")).toContainText("600,00");
  await page.getByRole("button", { name: "Backup" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Exportar/ }).click();
  expect((await download).suggestedFilename()).toMatch(/mes-backup/);
  expect(errors).toEqual([]);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});

test("CSV revisável, Pix para dívida, arquivo renomeado e transação igual legítima", async ({ page }) => {
  await createDebt(page);
  await nav(page, "Importações");
  await page.getByRole("button", { name: "Nova origem", exact: true }).click();
  await page.getByLabel("Banco", { exact: true }).selectOption("bb");
  await page.getByLabel("Identificação da conta ou cartão").fill("Conta principal");
  await page.getByRole("button", { name: "Salvar origem", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const csv = "Data;Descrição;Valor;ID\n05/09/2026;Mercado;-100,00;\n05/09/2026;Pix pai;-200,00;pix-1\n05/09/2026;Salário;1000,00;sal-1";
  await upload(page, "extrato.csv", csv);
  const rows = page.getByTestId("import-row");
  await rows.nth(0).getByLabel("Categoria", { exact: true }).selectOption("Alimentação");
  await rows.nth(1).getByLabel("Ação", { exact: true }).selectOption("debt");
  await rows.nth(1).getByLabel("Dívida", { exact: true }).selectOption({ label: "Carro com meu pai · Pai" });
  await expect(rows.nth(2).getByLabel("Ação", { exact: true })).toHaveValue("ignore");
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toHaveCount(0);
  const first = await readData(page);
  expect(first.version).toBe(3); expect(first.expenses).toHaveLength(2); expect(first.importRecords).toHaveLength(3);
  expect(first.expenses.find((e) => e.debtId)?.amountCents).toBe(20000);
  await nav(page, "Dívidas");
  await expect(page.locator(".debt-card")).toContainText("500,00");
  await nav(page, "Importações");
  await upload(page, "renomeado.csv", csv);
  await expect(page.getByRole("button", { name: "Salvar importação", exact: true })).toBeDisabled();
  await expect(rows.nth(0)).toContainText("Já registrada");
  expect((await readData(page)).expenses).toHaveLength(2);
  await page.getByRole("button", { name: "Refazer revisão", exact: true }).click();
  await upload(page, "sobreposto.csv", "Data;Descrição;Valor;ID\n05/09/2026;Mercado;-100,00;\n06/09/2026;Nova compra;-5,00;nova");
  await expect(rows.nth(0)).toContainText("Possível duplicidade");
  await rows.nth(0).getByLabel("Ação", { exact: true }).selectOption("create");
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "duplicidade" })).toBeVisible();
  expect((await readData(page)).expenses).toHaveLength(2);
  await rows.nth(0).getByLabel("Confirmo que é outra transação, mesmo com dados iguais").check();
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toHaveCount(0);
  expect((await readData(page)).expenses).toHaveLength(4);
  await page.reload(); await nav(page, "Importações");
  await expect(page.getByLabel("Origem bancária")).toHaveValue(first.bankSources[0].id);
});

test("Excel de cartão vincula parcela prevista e extrato OFX quita fatura uma única vez", async ({ page }) => {
  let data = saveCard(emptyFinanceData(), { name: "Itaú", closingDay: 25, dueDay: 5 });
  data = addExpense(data, { description: "Loja", amountCents: 30000, category: "Outros", date: "2026-09-05", status: "planned", kind: "installment", cardId: data.cards[0].id, totalInstallments: 3 });
  data = saveBankSource(data, { bank: "itau", name: "Cartão", kind: "card", cardId: data.cards[0].id, mapping: null });
  data = saveBankSource(data, { bank: "bb", name: "Conta", kind: "account", cardId: null, mapping: null });
  await page.evaluate((seed) => localStorage.setItem("mes.finance.v1", JSON.stringify(seed)), data);
  await page.reload(); await nav(page, "Importações");
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Fatura Itaú"], ["Data", "Descrição", "Valor"], ["05/10/2026", "Loja 2/3", 100]]), "Movimentos");
  await page.getByLabel("Mês de vencimento da fatura").fill("2026-10");
  await upload(page, "fatura.xlsx", XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const row = page.getByTestId("import-row");
  await expect(row).toContainText("Parece uma parcela 2/3");
  await row.getByLabel("Ação", { exact: true }).selectOption("link");
  await row.getByLabel("Gasto existente", { exact: true }).selectOption(data.expenses[1].id);
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toHaveCount(0);
  expect((await readData(page)).expenses).toHaveLength(3);
  await page.getByLabel("Origem bancária").selectOption(data.bankSources[1].id);
  const ofx = "<OFX><CURDEF>BRL<STMTTRN><DTPOSTED>20261005<TRNAMT>-100.00<FITID>pag-1<MEMO>Pagamento fatura Itau</STMTTRN></OFX>";
  await upload(page, "pagamento.ofx", ofx);
  await row.getByLabel("Ação", { exact: true }).selectOption("invoice");
  await row.getByLabel("Cartão da fatura paga").selectOption(data.cards[0].id);
  await row.getByLabel("Mês da fatura paga").fill("2026-10");
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toHaveCount(0);
  const saved = await readData(page);
  expect(saved.expenses).toHaveLength(3);
  expect(saved.invoices.find((i) => i.month === "2026-10")?.paid).toBe(true);
  await upload(page, "pagamento-repetido.ofx", ofx);
  await expect(row).toContainText("Já registrada");
  await expect(page.getByRole("button", { name: "Salvar importação", exact: true })).toBeDisabled();
});

test("revisão desatualizada exige reavaliar antes de salvar", async ({ page }) => {
  const data = saveBankSource(emptyFinanceData(), { bank: "mercado-pago", name: "Conta", kind: "account", cardId: null, mapping: null });
  await page.evaluate((seed) => localStorage.setItem("mes.finance.v1", JSON.stringify(seed)), data);
  await page.reload(); await nav(page, "Importações");
  await upload(page, "extrato.csv", "Data;Descrição;Valor\n05/10/2026;Loja;-10,00");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("mes.finance.v1")!); data.revision++;
    localStorage.setItem("mes.finance.v1", JSON.stringify(data));
    window.dispatchEvent(new StorageEvent("storage", { key: "mes.finance.v1" }));
  });
  await expect(page.getByRole("alert").filter({ hasText: "Os dados mudaram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar importação", exact: true })).toBeDisabled();
  expect((await readData(page)).expenses).toEqual([]);
});
