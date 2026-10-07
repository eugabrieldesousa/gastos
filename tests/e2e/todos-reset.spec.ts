import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { navigate } from "../helpers/navigation";
import { emptyFinanceData } from "../../src/lib/finance";

test.beforeEach(async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
});

test("TODO adiciona, edita, conclui, reabre, exporta e exclui tarefas", async ({ page }) => {
  await navigate(page, "TODO");
  await expect(page.getByRole("heading", { name: "TODO", exact: true })).toBeVisible();
  await expect(page.getByLabel("Selecionar mês")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Resumo do mês" })).toHaveCount(0);
  for (const text of ["Comprar pão", "Pagar internet"]) {
    await page.getByLabel("Nova tarefa", { exact: true }).fill(text); await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: text, exact: true })).toBeVisible();
  }
  await page.getByRole("checkbox", { name: "Comprar pão" }).click();
  await expect(page.getByRole("checkbox", { name: "Comprar pão" })).toBeChecked();
  await expect(page.locator(".todo-list li").first()).toContainText("Pagar internet");
  await expect(page.locator(".todo-completed")).toContainText("Comprar pão");
  await page.getByRole("button", { name: "Editar tarefa: Pagar internet" }).click();
  await page.getByLabel("Editar tarefa", { exact: true }).fill("Pagar conta de internet");
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await page.reload(); await navigate(page, "TODO");
  await expect(page.getByRole("checkbox", { name: "Comprar pão" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Pagar conta de internet" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Comprar pão" }).click();
  await expect(page.getByRole("checkbox", { name: "Comprar pão" })).not.toBeChecked();
  await expect(page.locator(".todo-list li").first()).toContainText("Comprar pão");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const downloading = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "Exportar backup", exact: true }).click();
  const backup = JSON.parse(await readFile((await (await downloading).path())!, "utf8"));
  expect(backup.version).toBe(6); expect(backup.todos).toHaveLength(2);
  await page.getByRole("button", { name: "Excluir tarefa: Comprar pão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Comprar pão" })).toBeVisible();
  await page.getByRole("button", { name: "Excluir tarefa: Comprar pão" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir tarefa", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Comprar pão" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("limpeza pede confirmação, apaga todos os meses e cancela autosave", async ({ page }) => {
  await page.evaluate((data) => {
    localStorage.setItem("mes.finance.v1", JSON.stringify(data)); localStorage.setItem("mes.theme", "dark");
    localStorage.setItem("mes.finance.v1.note-draft.closed-tab", "rascunho de uma aba fechada");
    window.dispatchEvent(new StorageEvent("storage", { key: "mes.finance.v1" }));
  }, { ...emptyFinanceData(), salaries: { "2026-01": 100, "2026-10": 200 } });
  await navigate(page, "Notas"); await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.getByLabel("Conteúdo", { exact: true }).fill("Este rascunho será apagado");
  await page.getByRole("button", { name: "Backup", exact: true }).click(); await page.getByRole("menuitem", { name: "Limpar tudo", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Limpar todos os dados?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!).salaries)).toEqual({ "2026-01": 100, "2026-10": 200 });
  await page.getByRole("button", { name: "Backup", exact: true }).click(); await page.getByRole("menuitem", { name: "Limpar tudo", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar limpeza", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!));
  expect(data).toEqual({ ...emptyFinanceData(), revision: data.revision });
  expect(await page.evaluate(() => localStorage.getItem("mes.theme"))).toBe("dark");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("mes.finance.v1.note-draft.")))).toEqual([]);
  await page.reload(); await navigate(page, "TODO"); await expect(page.getByRole("checkbox")).toHaveCount(0);
});
