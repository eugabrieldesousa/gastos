import { test, expect } from "@playwright/test";

test("login configurado inicia OAuth com callback correto e protege os dados sem sessão", async ({ page }) => {
  const unauthenticated = await page.request.get("/api/finance");
  expect(unauthenticated.status()).toBe(401);
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session?.user).toBeUndefined();
  let destination: URL | undefined;
  await page.route("https://github.com/login/oauth/authorize**", async (route) => {
    destination = new URL(route.request().url());
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: "<p>Autorização GitHub simulada</p>" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar com GitHub" }).click();
  await expect(page.getByText("Autorização GitHub simulada")).toBeVisible();
  expect(destination?.searchParams.get("client_id")).toBe("oauth-test-client");
  expect(destination?.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3003/api/auth/callback/github");
  expect(destination?.searchParams.get("scope")).not.toContain("repo");
  expect(destination?.searchParams.get("code_challenge")).toBeTruthy();
});
