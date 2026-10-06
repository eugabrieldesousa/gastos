import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  if (process.argv.includes("--if-configured")) {
    console.log("Sem DATABASE_URL: build disponível no modo local.");
    process.exit(0);
  }
  console.error("Configure DATABASE_URL em .env.local antes de executar a migração.");
  process.exit(1);
}
try {
  const sql = neon(process.env.DATABASE_URL);
  const migration = await readFile(new URL("../migrations/001_finance_documents.sql", import.meta.url), "utf8");
  await sql.query(migration);
  console.log("Tabela de dados por usuário pronta.");
} catch {
  console.error("Não foi possível preparar o banco. Confira a conexão e as permissões no Neon.");
  process.exitCode = 1;
}
