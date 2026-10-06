import { test, expect } from "@playwright/test";

test("login ainda não configurado informa o estado e preserva dados locais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Salvo neste navegador")).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem("mes.finance.v1"));
  await page.getByRole("button", { name: "Entrar com GitHub" }).click();
  await expect(page.getByRole("dialog", { name: "Login em preparação" })).toBeVisible();
  await expect(page.getByText("Por enquanto, seus dados ficam apenas neste navegador.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("mes.finance.v1"))).toBe(before);
  const response = await page.request.get("/api/finance");
  expect(response.status()).toBe(401);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect.poll(async () => {
    const bounds = await page.locator(".header-actions").boundingBox();
    return bounds!.x + bounds!.width;
  }).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
