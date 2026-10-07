import { navigate } from "../helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";
import { saveDebt } from "../../src/lib/debts";

async function nav(page: Page, section: string) {
  await navigate(page, section);
}
const read = (page: Page): Promise<FinanceData> => page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!));
async function create(page: Page, paidCount = 0) {
  await nav(page, "Dívidas");
  await page.getByRole("button", { name: "Nova dívida", exact: true }).click();
  await page.getByLabel("Tipo de dívida").selectOption("installment");
  await expect(page.getByLabel("Vencimento da primeira parcela restante")).toHaveValue("2026-10-06");
  await page.getByLabel("Nome da dívida").fill("Acordo com meu pai");
  await page.getByLabel("Credor", { exact: true }).fill("Pai");
  await page.getByLabel("Valor total", { exact: true }).fill("6.000,00");
  await page.getByLabel("Quantidade de parcelas", { exact: true }).fill("12");
  await page.getByLabel("Parcelas já pagas", { exact: true }).fill(String(paidCount));
  await page.getByLabel("Vencimento da primeira parcela restante").fill("2026-10-31");
  await expect(page.getByRole("dialog")).toContainText("12× de R$ 500,00");
  await page.getByRole("button", { name: "Cadastrar dívida", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function pay(page: Page, id: string, date = "2026-10-06") {
  await page.getByRole("button", { name: "Pagar parcela", exact: true }).click();
  await page.getByLabel("Parcela do combinado", { exact: true }).selectOption(id);
  await page.getByLabel("Data real do pagamento").fill(date);
  await page.getByRole("button", { name: "Salvar pagamento da parcela", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T15:00:00Z") });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
});

test("combinado prevê parcelas, antecipa, edita data, desfaz e preserva backup", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await create(page);
  const initial = await read(page);
  expect(initial.expenses).toHaveLength(12);
  await expect(page.getByTestId("month-total")).toContainText("500,00");
  await expect(page.getByTestId("planned-total")).toContainText("500,00");
  await expect(page.getByTestId("paid-total")).toContainText("0,00");
  await expect(page.locator(".debt-card")).toContainText("0/12 parcelas quitadas");
  await expect(page.locator(".debt-installment-row").first()).toBeHidden();
  await pay(page, initial.expenses[1].id);
  await expect(page.getByTestId("month-total")).toContainText("1.000,00");
  await expect(page.getByTestId("paid-total")).toContainText("500,00");
  await expect(page.locator(".debt-metrics")).toContainText("5.500,00");
  const paid = await read(page);
  expect(paid.expenses).toHaveLength(12);
  expect(paid.expenses[1]).toMatchObject({ id: initial.expenses[1].id, status: "paid", date: "2026-10-06", dueDate: "2026-11-30" });
  await page.locator(".debt-installment-history summary").click();
  await expect(page.locator(".debt-installment-row").nth(1)).toContainText("Pago em 2026-10-06");
  await page.getByRole("button", { name: "Editar pagamento da parcela 2", exact: true }).click();
  await page.getByLabel("Data real do pagamento").fill("2026-09-30");
  await page.getByRole("button", { name: "Salvar pagamento da parcela", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await read(page)).expenses[1].date).toBe("2026-09-30");
  await page.getByRole("button", { name: "Desfazer pagamento da parcela 2", exact: true }).click();
  await expect(page.locator(".debt-forecast")).toContainText("0/12");
  expect((await read(page)).expenses[1]).toEqual(initial.expenses[1]);
  await page.getByRole("button", { name: "Editar dívida Acordo com meu pai", exact: true }).click();
  await expect(page.getByLabel("Valor total", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("Nome da dívida").fill("Carro com meu pai");
  await page.getByRole("button", { name: "Salvar dívida", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Parcelamentos");
  await expect(page.locator(".installment-card")).toHaveCount(0);
  await page.reload(); await nav(page, "Dívidas");
  await expect(page.locator(".debt-card")).toContainText("Carro com meu pai");
  await expect(page.locator(".debt-installment-row").first()).toBeHidden();
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exportar backup", exact: true }).click();
  const { readFile } = await import("node:fs/promises");
  const backup = await readFile((await (await downloaded).path())!, "utf8");
  expect(JSON.parse(backup).expenses).toHaveLength(12);
  await page.getByLabel("Arquivo de backup").setInputFiles({ name: "combinado.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar dados", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".debt-card")).toContainText("6.000,00");
  await page.screenshot({ path: `.artifacts/debt-installment-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("histórico não cria gastos antigos e Gastos paga sem permitir excluir parcela", async ({ page }) => {
  await create(page, 3);
  await expect(page.locator(".debt-card")).toContainText("3/12 parcelas quitadas");
  await expect(page.locator(".debt-metrics")).toContainText("4.500,00");
  expect((await read(page)).expenses).toHaveLength(9);
  await nav(page, "Gastos");
  const row = page.getByTestId("expense-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Parcela 4/12");
  await row.getByRole("button", { name: /^Ações para/ }).click();
  await expect(page.getByRole("menuitem", { name: "Excluir gasto", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Pagar parcela", exact: true }).click();
  await page.getByRole("button", { name: "Salvar pagamento da parcela", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Pago");
  expect((await read(page)).expenses).toHaveLength(9);
  await nav(page, "Dívidas");
  await expect(page.locator(".debt-card")).toContainText("4/12 parcelas quitadas");
  await nav(page, "Gastos");
  await row.getByRole("button", { name: /^Ações para/ }).click();
  await page.getByRole("menuitem", { name: "Desfazer pagamento", exact: true }).click();
  await expect(row).toContainText("Previsto");
  await nav(page, "Dívidas");
  await expect(page.locator(".debt-card")).toContainText("3/12 parcelas quitadas");
});

test("extrato exige parcela e pode antecipar o vencimento de novembro", async ({ page }) => {
  await create(page);
  const initial = await read(page);
  await nav(page, "Importações");
  await page.getByRole("button", { name: "Nova origem", exact: true }).click();
  await page.getByLabel("Identificação da conta ou cartão").fill("Conta principal");
  await page.getByRole("button", { name: "Salvar origem", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Arquivo de extrato").setInputFiles({ name: "pix.csv", mimeType: "text/csv", buffer: Buffer.from("Data;Descrição;Valor;ID\n06/10/2026;Pix pai;-500,00;pix-1") });
  await page.getByRole("button", { name: "Revisar movimentações", exact: true }).click();
  const row = page.getByTestId("import-row");
  await row.getByLabel("Ação", { exact: true }).selectOption("debt");
  await row.getByLabel("Dívida", { exact: true }).selectOption(initial.debts[0].id);
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Selecione a parcela existente" })).toBeVisible();
  await row.getByLabel("Parcela do combinado", { exact: true }).selectOption(initial.expenses[1].id);
  await page.getByRole("button", { name: "Salvar importação", exact: true }).click();
  await expect(page.getByTestId("import-row")).toHaveCount(0);
  const saved = await read(page);
  expect(saved.expenses).toHaveLength(12);
  expect(saved.expenses[1]).toMatchObject({ status: "paid", date: "2026-10-06", dueDate: "2026-11-30" });
  expect(saved.importRecords[0].expenseId).toBe(initial.expenses[1].id);
  await nav(page, "Dívidas");
  await expect(page.locator(".debt-metrics")).toContainText("5.500,00");
});

test("custos de duas dívidas expandem independentemente", async ({ page }) => {
  let fixture = emptyFinanceData();
  for (const name of ["Carro A", "Carro B"]) fixture = saveDebt(fixture, { name, creditor: "Pai", category: "Carro", type: "itemized",
    originalCents: 10000, downPaymentCents: 0, historicalPaidCents: 0, startMonth: "2026-10", costs: [{ id: crypto.randomUUID(), description: "Peça", amountCents: 10000 }] });
  await page.evaluate((data) => localStorage.setItem("mes.finance.v1", JSON.stringify(data)), fixture);
  await page.reload(); await nav(page, "Dívidas");
  const cards = page.locator(".debt-card");
  await expect(cards.nth(0).locator(".debt-cost-row")).toBeHidden();
  await expect(cards.nth(1).locator(".debt-cost-row")).toBeHidden();
  await cards.nth(0).getByRole("button", { name: "Custos (1)", exact: true }).click();
  await expect(cards.nth(0).locator(".debt-cost-row")).toBeVisible();
  await expect(cards.nth(1).locator(".debt-cost-row")).toBeHidden();
  await cards.nth(0).getByRole("button", { name: "Custos (1)", exact: true }).click();
  await expect(cards.nth(0).locator(".debt-cost-row")).toBeHidden();
});
