import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const baseURL = "http://127.0.0.1:3003";

/** Tests OAuth initiation without calling GitHub or a real database. */
export default defineConfig({
  ...baseConfig,
  testDir: "./tests/auth",
  outputDir: ".artifacts/auth-tests",
  use: { ...baseConfig.use, baseURL },
  webServer: {
    command: "npm run start -- --port 3003",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      AUTH_GITHUB_ID: "oauth-test-client",
      AUTH_GITHUB_SECRET: "oauth-test-secret",
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
      DATABASE_URL: "postgresql://test:test@unused.invalid/test",
    },
  },
});
