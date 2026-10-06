import { describe, expect, it } from "vitest";
import { debtSummary, saveDebt, saveDebtPayment } from "../../src/lib/debts";
import { emptyFinanceData, financeSchema, monthSummary, parseBackup, removeOccurrence, saveCategory, saveExpense } from "../../src/lib/finance";

const today = "2026-10-05";
const payment = { description: "Pix pai", category: "Carro", date: "2026-08-05", status: "paid" as const, amountCents: 10000 };
function create() {
  return saveDebt(emptyFinanceData(), { name: "Carro", creditor: "Pai", category: "Carro", originalCents: 100000,
    downPaymentCents: 20000, historicalPaidCents: 10000, startMonth: "2026-07" });
}

describe("dívidas sem juros", () => {
  it("reduz o saldo com entrada e histórico sem inventar gastos", () => {
    const data = create();
    expect(debtSummary(data, data.debts[0], today)).toMatchObject({ remaining: 70000, amortized: 30000, monthsRemaining: null, averageCents: 0 });
    expect(monthSummary(data, "2026-10").total).toBe(0);
    expect(data.expenses).toEqual([]);
  });
  it("usa meses completos, soma múltiplos pagamentos e inclui os meses zerados", () => {
    let data = create();
    const debt = data.debts[0];
    data = saveDebtPayment(data, debt.id, payment, undefined, today);
    data = saveDebtPayment(data, debt.id, { ...payment, date: "2026-08-15", amountCents: 20000 }, undefined, today);
    data = saveDebtPayment(data, debt.id, { ...payment, date: today, amountCents: 10000 }, undefined, today);
    const summary = debtSummary(data, debt, today);
    expect(summary).toMatchObject({ remaining: 30000, averageCents: 10000, monthsRemaining: 3, endMonth: "2027-01", months: ["2026-07", "2026-08", "2026-09"] });
    expect(monthSummary(data, "2026-08").paid).toBe(30000);
    expect(monthSummary(data, "2026-11").total).toBe(0);
  });
  it("limita a janela ao início e usa a média exata para o arredondamento", () => {
    let data = saveDebt(emptyFinanceData(), { name: "Teste", creditor: "Pai", category: "Carro", originalCents: 11,
      downPaymentCents: 0, historicalPaidCents: 0, startMonth: "2026-09" });
    data = saveDebtPayment(data, data.debts[0].id, { ...payment, date: "2026-09-15", amountCents: 3 }, undefined, today);
    expect(debtSummary(data, data.debts[0], today)).toMatchObject({ months: ["2026-09"], monthsRemaining: 3, endMonth: "2027-01" });
    expect(debtSummary(data, data.debts[0], "2026-09-20").monthsRemaining).toBeNull();
  });
  it("não divide pela média arredondada de centavos", () => {
    let data = saveDebt(emptyFinanceData(), { name: "Centavos", creditor: "Pai", category: "Carro", originalCents: 2,
      downPaymentCents: 0, historicalPaidCents: 0, startMonth: "2026-07" });
    data = saveDebtPayment(data, data.debts[0].id, { ...payment, amountCents: 1 }, undefined, today);
    expect(debtSummary(data, data.debts[0], today)).toMatchObject({ averageCents: 0, monthsRemaining: 3 });
  });
  it("vincula gasto existente e recalcula ao editar ou excluir", () => {
    let data = saveExpense(create(), payment);
    const originalId = data.expenses[0].id;
    data = saveDebtPayment(data, data.debts[0].id, payment, originalId, today);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0]).toMatchObject({ id: originalId, kind: "debt", debtId: data.debts[0].id });
    data = saveDebtPayment(data, data.debts[0].id, { ...payment, amountCents: 20000 }, originalId, today);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(50000);
    data = removeOccurrence(data, data.expenses[0], "one");
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(70000);
  });
  it("impede excesso, pagamento futuro, datas anteriores e dívida inexistente", () => {
    const data = create(), debt = data.debts[0];
    expect(() => saveDebtPayment(data, debt.id, { ...payment, amountCents: 70001 }, undefined, today)).toThrow("saldo");
    expect(() => saveDebtPayment(data, debt.id, { ...payment, date: "2026-10-06" }, undefined, today)).toThrow("futura");
    expect(() => saveDebtPayment(data, debt.id, { ...payment, date: "2026-06-01" }, undefined, today)).toThrow("anterior");
    expect(() => saveDebtPayment(data, crypto.randomUUID(), payment, undefined, today)).toThrow("existente");
    expect(() => saveDebt(data, { ...debt, originalCents: 29999 }, debt.id)).toThrow("saldo");
    expect(() => saveExpense(data, { ...payment, kind: "debt", debtId: debt.id, amountCents: 90000 })).toThrow("saldo");
  });
  it("quita exatamente e não permite transformar pagamento em previsão", () => {
    let data = create();
    data = saveDebtPayment(data, data.debts[0].id, { ...payment, amountCents: 70000 }, undefined, today);
    expect(debtSummary(data, data.debts[0], today)).toMatchObject({ remaining: 0, monthsRemaining: 0 });
    expect(() => saveExpense(data, { ...data.expenses[0], status: "planned" }, data.expenses[0].id)).toThrow("pagos");
  });
  it("preserva categoria ao renomear, backups e migração v2", () => {
    let data = create();
    const category = data.categories.find((c) => c.name === "Carro")!;
    data = saveCategory(data, { ...category, name: "Veículos" }, category.id);
    expect(data.debts[0].category).toBe("Veículos");
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    const { debts: _debts, bankSources: _sources, importRecords: _records, ...old } = emptyFinanceData();
    void _debts; void _sources; void _records;
    const migrated = parseBackup(JSON.stringify({ ...old, version: 2, revision: 12, salaries: { "2026-10": 0 } }));
    expect(migrated).toMatchObject({ version: 3, revision: 12, debts: [], bankSources: [], importRecords: [], salaries: { "2026-10": 0 } });
    expect(financeSchema.safeParse({ ...data, debts: [...data.debts, data.debts[0]] }).success).toBe(false);
  });
});
