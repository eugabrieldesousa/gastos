import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addExpense, emptyFinanceData, saveCard, type FinanceData } from "../../src/lib/finance";

function fixture() {
  let data = saveCard({ ...emptyFinanceData(), salaries: { "2026-10": 100000, "2026-11": 100000 } }, { name: "Cartão azul", closingDay: 25, dueDay: 5 });
  data = addExpense(data, { description: "Conta de outubro", amountCents: 60000, category: "Moradia", date: "2026-10-01", status: "paid", kind: "single" });
  data = addExpense(data, { description: "Conta direta", amountCents: 10000, category: "Outros", date: "2026-11-03", status: "planned", kind: "single" });
  data = addExpense(data, { description: "Mercado no cartão", amountCents: 20000, category: "Alimentação", date: "2026-11-05", status: "planned", cardId: data.cards[0].id, kind: "single" });
  return addExpense(data, { description: "Compra em andamento", amountCents: 10000, category: "Saúde", date: "2026-11-05", status: "planned", cardId: data.cards[0].id,
    kind: "installment", firstInstallment: 4, totalInstallments: 5 });
}
async function seed(page: Page, data = fixture(), today = "2026-12-05") {
  await page.clock.setFixedTime(new Date(`${today}T15:00:00Z`));
  await page.addInitScript((value) => { if (!localStorage.getItem("mes.finance.v1")) localStorage.setItem("mes.finance.v1", JSON.stringify(value)); }, data);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  await page.getByLabel("Selecionar mês").fill("2026-11");
}
async function stored(page: Page): Promise<FinanceData> { return page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!)); }

test("Gastos inicia com faturas recolhidas; filtros mostram os itens e subtotais sem duplicar", async ({ page }) => {
  await seed(page);
  await expect(page.getByRole("heading", { name: "Gastos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por categoria", exact: true })).toHaveCount(0);
  const group = page.getByRole("region", { name: "Fatura Cartão azul", exact: true });
  const toggle = group.getByRole("button", { name: /Fatura · Cartão azul/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Ações para Mercado no cartão" })).toHaveCount(0);
  await expect(page.getByTestId("month-total")).toHaveText(/400,00/);
  await expect(page.getByTestId("expense-row")).toHaveCount(1);
  await toggle.click();
  await expect(group.getByTestId("expense-row")).toHaveCount(2);
  await page.getByLabel("Buscar gastos").fill("Mercado");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(group.getByTestId("expense-row")).toHaveCount(1);
  await expect(toggle).toContainText("300,00");
  await expect(toggle).toContainText("Filtrado: R$");
  await expect(toggle).toContainText("200,00");
  await expect(page.locator(".panel-footer")).toContainText("1 de 3 gastos");
  await expect(page.locator(".panel-footer")).toContainText("200,00");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Buscar gastos").fill("Mercad");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Por categoria", exact: true })).toBeVisible();
  await expect(page.getByTestId("expense-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver gastos: Alimentação", exact: true }).click();
  await expect(page.getByLabel("Filtrar por categoria")).toHaveValue("Alimentação");
  await expect(page.getByRole("button", { name: "Ações para Mercado no cartão" })).toBeVisible();
});

test("sobra opcional pode ser confirmada, editada, removida e exportada para IA", async ({ page }) => {
  await seed(page);
  await expect(page.getByTestId("remaining-total")).toHaveText(/600,00/);
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Levar sobra para o próximo mês", exact: true }).click();
  await expect(page.getByLabel("Valor da sobra a transferir")).toHaveValue("400,00");
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/1\.000,00/);
  await page.getByLabel("Valor da sobra a transferir").fill("500,00");
  await page.getByRole("button", { name: "Confirmar sobra", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("não ultrapasse");
  await page.getByLabel("Valor da sobra a transferir").fill("250,00");
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/850,00/);
  await page.getByRole("button", { name: "Confirmar sobra", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await stored(page)).expenses).toHaveLength(5);
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("remaining-total")).toHaveText(/850,00/);
  await expect(page.getByTestId("received-balance")).toContainText("250,00");
  await expect(page.getByTestId("received-balance")).toContainText(/outubro de 2026/i);
  await page.reload();
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("remaining-total")).toHaveText(/850,00/);
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exportar relatório para IA", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("mes-relatorio-ia-2026-12-05.json");
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.tipo).toBe("relatorio_financeiro_para_ia");
  expect(report.transferencias_de_sobra[0]).toMatchObject({ mes_origem: "2026-10", mes_destino: "2026-11", valor_centavos: 25000 });
  expect(report.meses_cadastrados.find((month: {mes: string}) => month.mes === "2026-11").sobra_prevista_centavos).toBe(85000);
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Editar transferência de sobra", exact: true }).click();
  await page.getByLabel("Valor da sobra a transferir").fill("400,00");
  await page.getByRole("button", { name: "Confirmar sobra", exact: true }).click();
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("remaining-total")).toHaveText(/1\.000,00/);
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Editar transferência de sobra", exact: true }).click();
  await page.getByRole("button", { name: "Remover transferência", exact: true }).click();
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("received-balance")).toHaveCount(0);
  await expect(page.getByTestId("remaining-total")).toHaveText(/600,00/);
  await page.getByLabel("Selecionar mês").fill("2027-01");
  await expect(page.getByRole("button", { name: "Levar sobra para o próximo mês", exact: true })).toHaveCount(0);
});

test("simula a sobra do mês atual sem salvar até confirmar e substitui a transferência ao editar", async ({ page }) => {
  await seed(page, fixture(), "2026-10-06");
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Simular próximo mês", exact: true }).click();
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/1\.000,00/);
  await page.getByLabel("Valor da sobra a transferir").fill("250,00");
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/850,00/);
  expect((await stored(page)).balanceTransfers).toEqual({});
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("remaining-total")).toHaveText(/600,00/);
  await expect(page.getByRole("button", { name: "Simular próximo mês", exact: true })).toHaveCount(0);
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Simular próximo mês", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar sobra", exact: true }).click();
  await page.getByRole("button", { name: "Editar transferência de sobra", exact: true }).click();
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/1\.000,00/);
  await page.getByLabel("Valor da sobra a transferir").fill("250,00");
  await expect(page.getByTestId("simulation-remaining")).toHaveText(/850,00/);
  await page.getByRole("button", { name: "Confirmar sobra", exact: true }).click();
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("remaining-total")).toHaveText(/850,00/);
});

test("simulação informa o salário ausente e mostra a sobra a receber separadamente", async ({ page }) => {
  const data = fixture();
  delete data.salaries["2026-11"];
  await seed(page, data, "2026-10-06");
  await page.getByLabel("Selecionar mês").fill("2026-10");
  await page.getByRole("button", { name: "Simular próximo mês", exact: true }).click();
  await expect(page.getByTestId("simulation-remaining")).toHaveText("—");
  await expect(page.getByTestId("simulation-received")).toHaveText(/400,00/);
  await expect(page.getByRole("dialog")).toContainText("Informe o salário do próximo mês");
  expect((await stored(page)).balanceTransfers).toEqual({});
});

test("parcela 4/5 mostra 80% com histórico e parcela atual, nos dois temas e tamanhos", async ({ page }, testInfo) => {
  await seed(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["Claro", "Escuro"]) {
    await page.getByRole("button", { name: /^Tema/ }).click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await page.getByRole("button", { name: "Parcelamentos", exact: true }).click();
    const progress = page.getByRole("progressbar", { name: "Posição das parcelas de Compra em andamento", exact: true });
    await expect(progress).toHaveAttribute("aria-valuenow", "4");
    await expect(progress).toHaveAttribute("aria-valuemax", "5");
    await expect(progress.locator("span")).toHaveAttribute("style", "width: 80%;");
    await expect(page.locator(".installment-card")).toContainText("0 pagas registradas");
    await expect(page.locator(".installment-card")).toContainText("4/5 · Atual, pendente");
    await page.screenshot({ path: testInfo.outputPath(`parcelas-${theme}.png`) });
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Análise do mês", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}.png`) });
  }
  expect(errors).toEqual([]);
});
