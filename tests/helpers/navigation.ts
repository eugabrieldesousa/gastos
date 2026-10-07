import { expect, type Page } from "@playwright/test";

export async function navigate(page: Page, name: string) {
  // A closing dropdown temporarily marks the header aria-hidden; the responsive
  // trigger still determines which navigation is available once it closes.
  const menu = page.getByRole("button", { name: "Abrir menu", exact: true, includeHidden: true });
  const mobile = await menu.isVisible();
  if (mobile) await menu.click();
  await page.getByRole("navigation", { name: "Seções do sistema" }).getByRole("button", { name, exact: true }).click();
  if (mobile) await expect(page.getByRole("dialog")).toHaveCount(0);
}
