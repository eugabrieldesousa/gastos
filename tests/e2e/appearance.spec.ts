import { expect, test, type Page } from "@playwright/test";
import { addExpense, emptyFinanceData, saveCard } from "../../src/lib/finance";

async function chooseTheme(page: Page, label: "Claro" | "Escuro" | "Sistema") {
  await page.getByRole("button", { name: /^Tema/ }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}

async function seedExpenses(page: Page) {
  let data = emptyFinanceData();
  data.salaries["2026-10"] = 500000;
  for (let i = 0; i < 35; i++) {
    data = addExpense(data, {
      description: `Compra ${i + 1}`,
      amountCents: 1500 + i * 100,
      category: data.categories[i % data.categories.length].name,
      date: "2026-10-05",
      status: i % 2 ? "paid" : "planned",
      kind: "single",
    });
  }
  await page.addInitScript((fixture) => {
    if (!localStorage.getItem("mes.finance.v1")) localStorage.setItem("mes.finance.v1", JSON.stringify(fixture));
  }, data);
}

async function ready(page: Page) {
  await expect(page.getByRole("button", { name: "Adicionar gasto", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Tema/ })).toBeEnabled();
}

/** Resolve the actual rendered colors, including OKLCH and translucent backgrounds. */
async function contrast(page: Page, selectors: string[], kind: "text" | "stroke" | "border" = "text") {
  return page.evaluate(({ selectors, kind }) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    function rgba(color: string) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) => i === 3 ? v / 255 : v);
    }
    function blend(fg: number[], bg: number[]) {
      return fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    }
    function luminance(rgb: number[]) {
      const linear = rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((el) => {
      const ancestors: Element[] = [];
      for (let current: Element | null = el; current; current = current.parentElement) ancestors.unshift(current);
      const background = ancestors.reduce((bg, ancestor) => blend(rgba(getComputedStyle(ancestor).backgroundColor), bg), [255, 255, 255]);
      const style = getComputedStyle(el);
      const foreground = blend(rgba(kind === "stroke" ? style.stroke : kind === "border" ? style.borderTopColor : style.color), background);
      const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
      return { selector, text: el.textContent?.slice(0, 40), ratio: (a + 0.05) / (b + 0.05) };
    }));
  }, { selectors, kind });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T15:00:00Z"));
});

test("atributo da extensão e tema salvo não causam aviso de hidratação", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("mes.theme", "dark");
    // Behave like an extension at document start, before React hydrates.
    const inject = () => {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute("trancy-version", "7.9.4");
      return true;
    };
    if (!inject()) {
      const observer = new MutationObserver(() => { if (inject()) observer.disconnect(); });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("trancy-version", "7.9.4");
  await expect(page.getByRole("button", { name: "Tema: Escuro", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("tema persiste, sincroniza abas e acompanha o sistema sem alterar finanças", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await seedExpenses(page);
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("button", { name: "Tema: Sistema", exact: true })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem("mes.finance.v1"));
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/");
  await ready(other);
  const trigger = page.getByRole("button", { name: /^Tema/ });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "Sistema", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Escuro", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(other.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("mes.theme"))).toBe("dark");
  await chooseTheme(page, "Claro");
  await expect(other.locator("html")).toHaveClass(/light/);
  await chooseTheme(page, "Sistema");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(await page.evaluate(() => localStorage.getItem("mes.finance.v1"))).toBe(before);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const button of [page.getByRole("button", { name: /^Tema/ }), page.getByRole("button", { name: "Backup", exact: true })]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await other.close();
});

test("temas mantêm contraste, gráficos legíveis e rolagem em painéis e modais", async ({ page }, testInfo) => {
  await seedExpenses(page);
  await page.goto("/");
  await ready(page);
  for (const label of ["Claro", "Escuro"] as const) {
    await chooseTheme(page, label);
    const ratios = await contrast(page, [".summary-label", ".summary-value", ".summary-caption", ".quiet-label", ".chart-legend span", ".chart-legend small", ".expense-description strong", ".expense-description small", ".expense-status", ".workspace-footer", ".theme-button", ".backup-button"]);
    expect(ratios.length).toBeGreaterThan(15);
    for (const pair of ratios) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
    for (const pair of await contrast(page, [".donut .data-color"], "stroke")) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath(`overview-${label}.png`) });
    await page.getByRole("button", { name: "Adicionar gasto", exact: true }).click();
    for (const pair of await contrast(page, ['[role="dialog"] [data-slot="input"]'], "border")) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(3);
    await page.getByLabel("Descrição", { exact: true }).fill("Conferência de contraste");
    await page.getByLabel("Descrição", { exact: true }).focus();
    const input = page.getByLabel("Descrição", { exact: true });
    await expect(input).toHaveCSS("outline-style", "solid");
    await expect(input).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Gastos", exact: true }).click();
  const panel = page.locator(".full-panel .panel-scroll");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await panel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(panel).toHaveCSS("scrollbar-width", "auto");
  expect(await panel.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width)).toBe("12px");
  await page.getByRole("button", { name: "Adicionar gasto", exact: true }).click();
  expect(await page.getByRole("dialog").evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width)).toBe("12px");
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 390 : 1440, height: 420 });
  expect(await page.getByRole("dialog").evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole("dialog").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await page.getByRole("dialog").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("dialog")).toHaveCSS("scrollbar-color", "auto");
});

test("guia dos bancos está disponível sem origem e acompanha banco e tipo selecionados", async ({ page }, testInfo) => {
  const data = saveCard(emptyFinanceData(), { name: "Cartão de teste", closingDay: 20, dueDay: 28 });
  await page.addInitScript((fixture) => localStorage.setItem("mes.finance.v1", JSON.stringify(fixture)), data);
  await page.goto("/");
  await ready(page);
  await chooseTheme(page, "Escuro");
  await page.getByRole("button", { name: "Importações", exact: true }).click();
  const guide = page.locator(".bank-guide");
  await guide.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(guide).toHaveAttribute("open", "");
  await expect(guide.locator(".bank-guide-bank")).toHaveCount(3);
  await expect(guide).toContainText("Só encontrou PDF?");
  await expect(guide).toContainText("exportação da fatura em CSV ou Excel não foi confirmada");
  await expect(guide.getByRole("link", { name: /Orientação oficial do Mercado Pago/ })).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "Nova origem", exact: true }).click();
  await page.getByLabel("Banco", { exact: true }).selectOption("itau");
  await page.getByLabel("Identificação da conta ou cartão").fill("Conta principal");
  await page.getByRole("button", { name: "Salvar origem", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const account = guide.locator('[data-bank="itau"] [data-kind="account"]');
  await expect(account).toContainText("Tipo da origem selecionada");
  await expect(guide.locator('[data-bank="itau"]')).toContainText("Origem selecionada: Conta principal");
  for (const pair of await contrast(page, ['[data-sonner-toast] [data-title]'])) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "Editar origem", exact: true }).click();
  await page.getByLabel("Tipo da origem").selectOption("card");
  await page.getByLabel("Cartão cadastrado").selectOption(data.cards[0].id);
  await page.getByRole("button", { name: "Salvar origem", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(guide.locator('[data-bank="itau"] [data-kind="card"]')).toContainText("Tipo da origem selecionada");
  await expect(account).not.toContainText("Tipo da origem selecionada");
  for (const pair of await contrast(page, [".bank-guide-kind p", ".bank-guide-selected"])) expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
  await guide.locator('[data-bank="itau"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("bank-guide-dark.png") });
  await guide.locator("summary").click();
  const headers = "Data;Descrição;Valor;" + Array.from({ length: 15 }, (_, i) => `Informação complementar ${i}`).join(";");
  const row = "05/10/2026;Compra teste;-12,34;" + Array.from({ length: 15 }, (_, i) => `Detalhe da movimentação ${i}`).join(";");
  await page.getByLabel("Arquivo de extrato").setInputFiles({ name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(`${headers}\n${row}`) });
  await expect(page.getByRole("heading", { name: "Confira as colunas do arquivo" })).toBeVisible();
  await page.getByText("Primeiras linhas do arquivo", { exact: true }).click();
  const preview = page.locator(".import-raw-preview");
  expect(await preview.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await preview.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  expect(await preview.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await preview.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").height)).toBe("12px");
  await page.getByRole("button", { name: "Revisar movimentações", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de importar" })).toBeVisible();
});
