import type { FinanceData } from "./finance";

export interface CloudStore {
  read(userId: string): Promise<FinanceData>;
  write(userId: string, data: FinanceData, expectedRevision: number, expectedSnapshotHash: string): Promise<FinanceData>;
}

export class CloudStoreError extends Error {
  constructor(message: string, readonly status: 403 | 503 = 503) {
    super(message);
    this.name = "CloudStoreError";
  }
}
