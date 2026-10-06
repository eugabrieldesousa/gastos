import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const storageKey = "mes.finance.v1";

async function setSalary(page: Page, value: string) {
  await page
    .getByRole("button", { name: /^(Informar|Editar) salário$/ })
    .click();
  await page.getByLabel("Salário líquido").fill(value);
  await page
    .getByRole("button", { name: "Salvar salário", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function addExpense(
  page: Page,
  description: string,
  value: string,
  status = "paid",
  date = "2026-10-05",
) {
  await page
    .getByRole("button", { name: "Adicionar gasto", exact: true })
    .click();
  await page.getByLabel("Valor", { exact: true }).fill(value);
  await page.getByLabel("Descrição", { exact: true }).fill(description);
  await page.getByLabel("Data", { exact: true }).fill(date);
  if (status === "planned") {
    await page.getByLabel("Situação", { exact: true }).selectOption("planned");
  }
  await page.getByRole("button", { name: "Salvar gasto", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function openActions(page: Page, description: string) {
  await page
    .getByRole("button", { name: `Ações para ${description}`, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T15:00:00Z"));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeEnabled();
});

test("fluxo mensal: salário, gastos, filtros, edição, status, persistência e exclusão", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByText("Seu mês começa por aqui")).toBeVisible();
  await expect(page.getByTestId("remaining-total")).toHaveText("—");
  await setSalary(page, "5.000,00");
  await addExpense(page, "Mercado", "1.200,00");
  await addExpense(page, "Aluguel", "800,00", "planned");
  await expect(page.getByTestId("remaining-total")).toHaveText(/3\.000,00/);
  await expect(page.getByTestId("paid-total")).toHaveText(/1\.200,00/);
  await expect(page.getByTestId("planned-total")).toHaveText(/800,00/);
  await page.getByRole("button", { name: "Gastos", exact: true }).click();
  await page.getByRole("tab", { name: "Previstos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ações para Mercado" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("remaining-total")).toHaveText(/3\.000,00/);
  await openActions(page, "Aluguel");
  await page.getByRole("menuitem", { name: "Marcar como pago" }).click();
  await expect(page.getByText("Nenhum gasto com essa situação")).toBeVisible();
  await expect(page.getByTestId("remaining-total")).toHaveText(/3\.000,00/);
  await page.getByRole("tab", { name: "Todos", exact: true }).click();
  await openActions(page, "Mercado");
  await page.getByRole("menuitem", { name: "Editar gasto" }).click();
  await page.getByLabel("Descrição", { exact: true }).fill("Supermercado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ações para Supermercado" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Ações para Supermercado" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Ações para Mercado", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("remaining-total")).toHaveText(/3\.000,00/);
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("remaining-total")).toHaveText("—");
  await setSalary(page, "6.000,00");
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByTestId("salary-total")).toHaveText(/5\.000,00/);
  await page.screenshot({
    path: `.artifacts/${testInfo.project.name}-dashboard.png`,
    fullPage: true,
  });
  await openActions(page, "Supermercado");
  await page.getByRole("menuitem", { name: "Excluir gasto" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ações para Supermercado" }),
  ).toBeVisible();
  await openActions(page, "Supermercado");
  await page.getByRole("menuitem", { name: "Excluir gasto" }).click();
  await page
    .getByRole("button", { name: "Excluir gasto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ações para Supermercado" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("remaining-total")).toHaveText(/4\.200,00/);
  const dates = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).expenses.map(
        (item: { date: string }) => item.date,
      ),
    storageKey,
  );
  expect(dates).toEqual(["2026-10-05"]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("salário ausente, salário zero, sobra negativa e validação", async ({
  page,
}) => {
  await addExpense(page, "Café", "0,10");
  await addExpense(page, "Pão", "0,20", "planned");
  await expect(page.getByTestId("remaining-total")).toHaveText("—");
  await setSalary(page, "0");
  await expect(page.getByTestId("remaining-total")).toHaveText(/-.*0,30/);
  await page
    .getByRole("button", { name: "Adicionar gasto", exact: true })
    .click();
  await page.getByLabel("Valor", { exact: true }).fill("-10");
  await page.getByRole("button", { name: "Salvar gasto", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valor maior que zero");
  await page.getByLabel("Valor", { exact: true }).fill("10,00");
  await page.getByRole("button", { name: "Salvar gasto", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Dê um nome");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
});

test("exporta todos os meses e só restaura após confirmação", async ({
  page,
}) => {
  await setSalary(page, "5.000,00");
  await addExpense(page, "Mercado", "1.200,00");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await setSalary(page, "6.000,00");
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exportar backup" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.salaries).toEqual({ "2026-10": 500000, "2026-11": 600000 });
  expect(data.expenses).toHaveLength(1);
  await setSalary(page, "7.000,00");
  await page.getByLabel("Arquivo de backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByTestId("salary-total")).toHaveText(/7\.000,00/);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("salary-total")).toHaveText(/7\.000,00/);
  await page.getByLabel("Arquivo de backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page
    .getByRole("button", { name: "Restaurar dados", exact: true })
    .click();
  await expect(page.getByTestId("salary-total")).toHaveText(/5\.000,00/);
  await expect(page.getByTestId("remaining-total")).toHaveText(/3\.800,00/);
  await page.getByLabel("Arquivo de backup").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.getByText(/Backup inválido/)).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("salary-total")).toHaveText(/5\.000,00/);
});

test("falha de gravação mantém formulário e dados anteriores", async ({
  page,
}) => {
  await setSalary(page, "5.000,00");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Editar salário", exact: true })
    .click();
  await page.getByLabel("Salário líquido").fill("6.000,00");
  await page
    .getByRole("button", { name: "Salvar salário", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Não foi possível salvar/).first()).toBeVisible();
  await expect(page.getByTestId("salary-total")).toHaveText(/5\.000,00/);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("salary-total")).toHaveText(/5\.000,00/);
});

test("dados corrompidos são preservados e podem ser recuperados por backup", async ({
  page,
}) => {
  await page.evaluate(
    (key) => localStorage.setItem(key, "corrupt"),
    storageKey,
  );
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "preservados",
  );
  await expect(
    page.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("corrupt");
  const valid = {
    version: 1,
    revision: 0,
    salaries: { "2026-10": 100000 },
    expenses: [],
  };
  await page.getByLabel("Arquivo de backup").setInputFiles({
    name: "recovery.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(valid)),
  });
  await page
    .getByRole("button", { name: "Restaurar dados", exact: true })
    .click();
  await expect(page.getByTestId("salary-total")).toHaveText(/1\.000,00/);
  await expect(
    page.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeEnabled();
});

test("datas movem o gasto para o mês correto e teclado retorna ao botão", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Adicionar gasto", exact: true })
    .click();
  await expect(page.getByLabel("Descrição", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeFocused();
  await addExpense(page, "Viagem", "100,00", "planned", "2026-11-10");
  await expect(page.getByTestId("selected-month")).toHaveText(
    "novembro de 2026",
  );
  await expect(
    page.getByRole("button", { name: "Ações para Viagem" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByText("Seu mês começa por aqui")).toBeVisible();
});

test("duas abas acompanham as alterações sem apagar lançamentos", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-10-05T15:00:00Z"));
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeEnabled();
  await setSalary(page, "5.000,00");
  await expect(other.getByTestId("salary-total")).toHaveText(/5\.000,00/);
  await addExpense(other, "Internet", "100,00", "planned");
  await expect(page.getByTestId("planned-total")).toHaveText(/100,00/);
  await expect(page.getByTestId("remaining-total")).toHaveText(/4\.900,00/);
});
