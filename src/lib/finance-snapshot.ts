import type { FinanceData } from "./finance";

/** A checksum travels with writes, outside the financial document and its backup format. */
export async function financeSnapshotHash(data: FinanceData): Promise<string> {
  const canonical = JSON.stringify(data, (_, value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
