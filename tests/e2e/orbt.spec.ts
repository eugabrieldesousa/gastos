import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { navigate } from "../helpers/navigation";
import { emptyFinanceData, type FinanceData } from "../../src/lib/finance";

async function stored(page: Page): Promise<FinanceData> { return page.evaluate(() => JSON.parse(localStorage.getItem("mes.finance.v1")!)); }
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-07T15:00:00Z"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
});

test("Orbt e navegação lateral persistem no desktop e abrem no celular", async ({ page, isMobile }, testInfo) => {
  await expect(page).toHaveTitle("Orbt — Sua central pessoal");
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "Seções do sistema" })).not.toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.mouse.click(380, 150);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else {
    await page.getByRole("button", { name: "Recolher sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expandir sidebar" })).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: "Expandir sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Expandir sidebar" }).click();
  }
  await navigate(page, "Ganhos");
  await expect(page.getByRole("heading", { name: "Ganhos", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: `.artifacts/${testInfo.project.name}-orbt-ganhos.png`, fullPage: true });
});

test("freelas recebidos e previstos atualizam sobra e podem mudar de mês", async ({ page }) => {
  await navigate(page, "Ganhos");
  await page.getByRole("button", { name: "Adicionar ganho", exact: true }).click();
  await page.getByLabel("Descrição do ganho").fill("Site cliente");
  await page.getByLabel("Valor do ganho (R$)").fill("1.500,50");
  await page.getByLabel("Situação do ganho").selectOption("planned");
  await page.getByLabel("Data prevista").fill("2026-10-12");
  await page.getByRole("button", { name: "Salvar ganho" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("income-planned")).toHaveText(/1\.500,50/);
  await expect(page.getByTestId("remaining-total")).toHaveText(/1\.500,50/);
  await expect(page.getByText("Salário não informado; inclui ganhos extras")).toBeVisible();
  await page.getByRole("button", { name: "Editar ganho Site cliente" }).click();
  await page.getByLabel("Situação do ganho").selectOption("received");
  await page.getByLabel("Data do recebimento").fill("2026-11-02");
  await page.getByRole("button", { name: "Salvar ganho" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("remaining-total")).toHaveText("—");
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await expect(page.getByTestId("income-received")).toHaveText(/1\.500,50/);
  expect((await stored(page)).incomes).toHaveLength(1);
  await page.reload();
  await navigate(page, "Ganhos");
  await page.getByLabel("Selecionar mês").fill("2026-11");
  await page.getByRole("button", { name: "Excluir ganho Site cliente" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir ganho", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await stored(page)).incomes).toHaveLength(0);
});

test("notas salvam automaticamente, entram no backup e persistem após recarregar", async ({ page }, testInfo) => {
  await navigate(page, "Notas");
  await expect(page.getByLabel("Selecionar mês")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Resumo do mês" })).toHaveCount(0);
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Ideias de freelas");
  await page.getByLabel("Conteúdo", { exact: true }).fill("Criar um site para o cliente\nRevisar orçamento");
  await expect(page.getByRole("status")).toContainText("Salvo");
  expect((await stored(page)).notes[0]).toMatchObject({ title: "Ideias de freelas", content: "Criar um site para o cliente\nRevisar orçamento" });
  await page.screenshot({ path: `.artifacts/${testInfo.project.name}-orbt-notas.png`, fullPage: true });
  await page.getByLabel("Conteúdo", { exact: true }).fill("Texto mais recente");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exportar backup", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("orbt-backup-2026-10-07.json");
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.version).toBe(6);
  expect(backup.notes[0].content).toBe("Texto mais recente");
  await page.reload();
  await navigate(page, "Notas");
  await page.getByRole("button", { name: /Ideias de freelas/ }).click();
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Texto mais recente");
  await page.getByLabel("Conteúdo", { exact: true }).fill("Salvar ao sair");
  await navigate(page, "Gastos");
  expect((await stored(page)).notes[0].content).toBe("Salvar ao sair");
  await navigate(page, "Notas");
  await page.getByRole("button", { name: "Excluir nota", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir nota", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await stored(page)).notes).toHaveLength(0);
});

test("falha de armazenamento preserva rascunho e bloqueia saída até recuperar", async ({ page }) => {
  await navigate(page, "Notas");
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.getByLabel("Conteúdo", { exact: true }).fill("Não pode sumir");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) { if (key === "mes.finance.v1") throw new Error("Quota"); original.call(this, key, value); };
  });
  await expect(page.getByRole("status")).toContainText("Não foi possível salvar");
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Seções do sistema" }).getByRole("button", { name: "Gastos", exact: true }).click();
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Notas", exact: true })).toBeVisible();
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Não pode sumir");
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  expect((await stored(page)).notes[0].content).toBe("Não pode sumir");
});

test("atualização de outra aba preserva rascunho e permite revisar conflito", async ({ page }) => {
  const note = { id: crypto.randomUUID(), title: "Compartilhada", content: "Original", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" };
  await page.evaluate((data) => { localStorage.setItem("mes.finance.v1", JSON.stringify(data)); window.dispatchEvent(new StorageEvent("storage", { key: "mes.finance.v1" })); }, { ...emptyFinanceData(), notes: [note] });
  await navigate(page, "Notas");
  await page.getByRole("button", { name: /Compartilhada/ }).click();
  await page.getByLabel("Conteúdo", { exact: true }).fill("Meu texto");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("mes.finance.v1")!);
    data.notes[0].content = "Texto remoto"; data.notes[0].updatedAt = "2026-10-07T14:00:00.000Z"; data.revision++;
    localStorage.setItem("mes.finance.v1", JSON.stringify(data)); window.dispatchEvent(new StorageEvent("storage", { key: "mes.finance.v1" }));
  });
  await expect(page.getByRole("status")).toContainText("rascunho foi preservado");
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Meu texto");
  await page.getByRole("button", { name: "Recarregar e revisar" }).click();
  await expect(page.getByText("Texto remoto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salvar meu rascunho sobre esta versão" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  expect((await stored(page)).notes[0].content).toBe("Meu texto");
});

test("notas respeitam temas, salvam ao trocar e avisam quando há texto pendente", async ({ page, isMobile }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await navigate(page, "Notas");
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Primeira");
  await page.getByLabel("Conteúdo", { exact: true }).fill("Salvar antes de trocar");
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  if (isMobile) await page.getByRole("button", { name: "Voltar às notas" }).click();
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  expect((await stored(page)).notes[0].content).toBe("Salvar antes de trocar");
  await page.getByLabel("Conteúdo", { exact: true }).fill("Nota sem título");
  await expect(page.getByRole("status")).toContainText("Salvo");
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  if (isMobile) await page.getByRole("button", { name: "Voltar às notas" }).click();
  await page.getByRole("button", { name: /Primeira/ }).click();
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue("Salvar antes de trocar");
  for (const theme of ["Claro", "Escuro"]) {
    await page.getByRole("button", { name: /^Tema/ }).click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
    await expect(page.getByLabel("Conteúdo", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.artifacts/${testInfo.project.name}-orbt-notas-${theme}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
