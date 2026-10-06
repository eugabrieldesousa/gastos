import { expect, test } from "@playwright/test";

test("cria categoria dentro do gasto sem perder o formulário e devolve o foco", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T15:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar gasto", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Compra de livro");
  await page.getByLabel("Valor", { exact: true }).fill("40,00");
  await page
    .getByRole("button", { name: "Criar categoria", exact: true })
    .click();
  await page.getByLabel("Nome da categoria").fill("Livros");
  await page
    .getByRole("button", { name: "Salvar categoria", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Criar categoria", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Compra de livro",
  );
  await expect(page.getByLabel("Valor", { exact: true })).toHaveValue("40,00");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Livros" });
  await page.getByRole("button", { name: "Salvar gasto", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("month-total")).toHaveText(/40,00/);
  await page.getByRole("button", { name: "Categorias", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar categoria Livros", exact: true })
    .click();
  await page.getByLabel("Nome da categoria").fill("Alimentação");
  await page
    .getByRole("button", { name: "Salvar categoria", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar categoria Livros", exact: true }),
  ).toBeFocused();
});
