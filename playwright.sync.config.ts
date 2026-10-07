import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import baseConfig from "./playwright.config";

const baseURL = "http://127.0.0.1:3004";
// Inherited by test workers; never use production credentials or real GitHub data.
process.env.ORBT_SYNC_TEST_SECRET ??= randomBytes(32).toString("base64url");
export default defineConfig({
  ...baseConfig,
  testDir: "./tests/sync",
  outputDir: ".artifacts/sync-tests",
  use: { ...baseConfig.use, baseURL },
  webServer: {
    command: "npm run dev -- --port 3004",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_SECRET: process.env.ORBT_SYNC_TEST_SECRET,
      AUTH_GITHUB_ID: "sync-test-client",
      AUTH_GITHUB_SECRET: "sync-test-secret",
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
      GITHUB_DATA_REPOSITORY: "test-owner/test-data",
      GITHUB_DATA_TOKEN: "sync-test-data-token",
    },
  },
});
