import { neon } from "@neondatabase/serverless";
import { emptyFinanceData, financeSchema, type FinanceData } from "./finance";
import { StorageConflictError } from "./repository";

export interface CloudStore {
  read(userId: string): Promise<FinanceData>;
  write(userId: string, data: FinanceData, expectedRevision: number): Promise<FinanceData>;
}

export class NeonFinanceStore implements CloudStore {
  private sql() {
    if (!process.env.DATABASE_URL) throw new Error("Banco de dados não configurado.");
    return neon(process.env.DATABASE_URL);
  }

  async read(userId: string): Promise<FinanceData> {
    const sql = this.sql();
    const rows = await sql`SELECT data FROM finance_documents WHERE user_id = ${userId}`;
    return rows.length ? financeSchema.parse(rows[0].data) : emptyFinanceData();
  }

  async write(userId: string, data: FinanceData, expectedRevision: number): Promise<FinanceData> {
    const sql = this.sql();
    const next = financeSchema.parse({ ...data, revision: expectedRevision + 1 });
    const json = JSON.stringify(next);
    // One atomic statement prevents lost updates, including the first save on two devices.
    const rows = expectedRevision === 0
      ? await sql`
          INSERT INTO finance_documents (user_id, revision, data)
          VALUES (${userId}, ${next.revision}, ${json}::jsonb)
          ON CONFLICT (user_id) DO UPDATE
          SET revision = EXCLUDED.revision, data = EXCLUDED.data, updated_at = now()
          WHERE finance_documents.revision = ${expectedRevision}
          RETURNING data`
      : await sql`
          UPDATE finance_documents
          SET revision = ${next.revision}, data = ${json}::jsonb, updated_at = now()
          WHERE user_id = ${userId} AND revision = ${expectedRevision}
          RETURNING data`;
    if (!rows.length) throw new StorageConflictError();
    return financeSchema.parse(rows[0].data);
  }
}
