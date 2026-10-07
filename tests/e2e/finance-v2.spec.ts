import { navigate } from "../helpers/navigation";
import { expect, test, type Page } from "@playwright/test";

const nav = navigate;
async function add(
  page: Page,
  options: {
    description: string;
    amount: string;
    kind?: string;
    category?: string;
    card?: string;
    count?: number;
    first?: number;
  },
) {
  await page
    .getByRole("button", { name: "Adicionar gasto", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill(options.description);
  if (options.kind)
    await page.getByLabel("Tipo de gasto").selectOption(options.kind);
  if (options.first)
    await page.getByLabel("Parcela inicial").fill(String(options.first));
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Valor/).fill(options.amount);
  await page.getByLabel("Data", { exact: true }).fill("2026-10-05");
  if (options.category)
    await page
      .getByLabel("Categoria", { exact: true })
      .selectOption({ label: options.category });
  if (options.card) {
    await page
      .getByLabel("Pagamento", { exact: true })
      .selectOption({ label: options.card });
    await page
      .getByLabel(
        options.kind === "installment" ? "Primeira fatura" : "Fatura",
        { exact: true },
      )
      .fill("2026-10");
  } else
    await page.getByLabel("Situação", { exact: true }).selectOption("planned");
  if (options.count)
    await page.getByLabel("Total de parcelas").fill(String(options.count));
  await page.getByRole("button", { name: "Salvar gasto", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T15:00:00Z"));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Adicionar gasto", exact: true }),
  ).toBeEnabled();
});

test("cartão, compras fixas, parcelas novas e em andamento, quitação e persistência", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await nav(page, "Cartões e faturas");
  await page
    .getByRole("button", { name: "Cadastrar cartão", exact: true })
    .click();
  await page.getByLabel("Nome do cartão").fill("Nubank");
  await page.getByLabel("Dia do fechamento").fill("25");
  await page.getByLabel("Dia do vencimento").fill("5");
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await add(page, {
    description: "Spotify",
    amount: "60,00",
    kind: "fixed",
    category: "Música",
    card: "Nubank",
  });
  await add(page, {
    description: "Fone de ouvido",
    amount: "100,01",
    kind: "installment",
    count: 3,
    category: "Música",
    card: "Nubank",
  });
  await add(page, {
    description: "Seguro parcelado",
    amount: "150,00",
    kind: "installment",
    count: 10,
    first: 4,
    category: "Carro",
    card: "Nubank",
  });
  await expect(page.getByTestId("month-total")).toHaveText(/243,34/);
  await expect(page.getByTestId("planned-total")).toHaveText(/243,34/);
  await page
    .getByRole("button", { name: "Quitar fatura", exact: true })
    .click();
  await expect(page.getByTestId("paid-total")).toHaveText(/243,34/);
  await expect(page.getByTestId("planned-total")).toHaveText(/0,00/);
  await expect(page.getByTestId("month-total")).toHaveText(/243,34/);
  await expect(
    page.getByRole("button", { name: "Adicionar compra", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("planned-total")).toHaveText(/243,34/);
  await expect(page.getByTestId("paid-total")).toHaveText(/0,00/);
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await page.getByRole("button", { name: "Desfazer quitação" }).click();
  await expect(page.getByTestId("planned-total")).toHaveText(/243,34/);
  await nav(page, "Parcelamentos");
  await expect(
    page.getByText("3 anteriores: histórico informado"),
  ).toBeVisible();
  await expect(page.getByText("0 pagas registradas · 7 pendentes")).toBeVisible();
  await page.getByRole("button", { name: "Ver parcelas" }).last().click();
  await expect(
    page.getByRole("button", { name: "Ações para Seguro parcelado" }),
  ).toHaveCount(7);
  await page.reload();
  await expect(page.getByTestId("planned-total")).toHaveText(/243,34/);
  await page.screenshot({
    path: `.artifacts/${testInfo.project.name}-v2-dashboard.png`,
  });
  expect(errors).toEqual([]);
});

test("categorias personalizadas, gráfico interativo, arquivamento e recorrência", async ({
  page,
}) => {
  await nav(page, "Categorias");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill("Estudos");
  await page.getByLabel("Ícone", { exact: true }).selectOption("work");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(
    page.getByRole("heading", { name: "Estudos", exact: true }),
  ).toBeVisible();
  await add(page, {
    description: "Curso",
    amount: "99,90",
    kind: "fixed",
    category: "Estudos",
  });
  await nav(page, "Dashboard");
  await page
    .getByRole("button", { name: "Ver gastos: Estudos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gastos", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Filtrar por categoria")).toHaveValue("Estudos");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("month-total")).toHaveText(/99,90/);
  await page.getByRole("button", { name: "Ações para Curso" }).click();
  await page.getByRole("menuitem", { name: "Editar gasto" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("110,00");
  await page.getByLabel("Aplicar alteração").selectOption("one");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByTestId("month-total")).toHaveText(/110,00/);
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("month-total")).toHaveText(/99,90/);
  await page.getByRole("button", { name: "Ações para Curso" }).click();
  await page
    .getByRole("menuitem", { name: "Excluir / encerrar recorrência" })
    .click();
  await page.getByLabel("Alcance da exclusão").selectOption("future");
  await page
    .getByRole("button", { name: "Excluir gasto", exact: true })
    .click();
  await expect(page.getByTestId("month-total")).toHaveText(/0,00/);
  await nav(page, "Categorias");
  await page
    .getByRole("button", { name: "Arquivar categoria Estudos" })
    .click();
  await expect(
    page.getByRole("button", { name: "Reativar categoria Estudos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByTestId("month-total")).toHaveText(/110,00/);
});

test("migração v1 e viewport com listas extensas em todas as áreas", async ({
  page,
}, testInfo) => {
  const expenses = Array.from({ length: 70 }, (_, i) => ({
    id: crypto.randomUUID(),
    description: `Compra ${i + 1} com uma descrição bastante extensa para validar o espaço`,
    category: i % 2 ? "Alimentação" : "Lazer",
    amountCents: 12345,
    date: "2026-10-05",
    status: "planned",
  }));
  await page.evaluate(
    (value) => localStorage.setItem("mes.finance.v1", JSON.stringify(value)),
    { version: 1, revision: 5, salaries: { "2026-10": 1000000 }, expenses },
  );
  await page.reload();
  const sizes =
    testInfo.project.name === "desktop"
      ? [
          { width: 1366, height: 768 },
          { width: 1440, height: 900 },
        ]
      : [{ width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const name of [
      "Dashboard",
      "Gastos",
      "Cartões e faturas",
      "Parcelamentos",
      "Categorias",
    ]) {
      await nav(page, name);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Adicionar gasto", exact: true }),
      ).toBeVisible();
    }
    await nav(page, "Gastos");
    const panel = page.locator(".expense-panel .panel-scroll");
    expect(
      await panel.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      page.getByRole("button", {
        name: `Ações para ${expenses.find((e) => e.description.startsWith("Compra 9 "))!.description}`,
        exact: true,
      }),
    ).toBeVisible();
    await nav(page, "Dashboard");
    await page.screenshot({
      path: `.artifacts/${testInfo.project.name}-${size.width}-v2-overview.png`,
    });
  }
  await add(page, { description: "Novo gasto", amount: "10,00" });
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mes.finance.v1")!),
  );
  expect(stored.version).toBe(5);
  expect(stored.expenses).toHaveLength(71);
  expect(stored.revision).toBe(6);
});
