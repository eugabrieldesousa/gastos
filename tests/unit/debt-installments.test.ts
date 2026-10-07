import { describe, expect, it } from "vitest";
import { debtInstallmentSummary, debtSummary, saveDebt, saveDebtPayment, setDebtInstallmentPayment, type DebtSaveInput } from "../../src/lib/debts";
import { editOccurrence, emptyFinanceData, financeSchema, installmentSummaries, monthSummary, parseBackup, removeOccurrence, saveExpense } from "../../src/lib/finance";
import { LocalFinanceRepository, StorageConflictError } from "../../src/lib/repository";

const today = "2026-10-06";
const input: DebtSaveInput = { name: "Carro", creditor: "Pai", category: "Carro", type: "installment", originalCents: 600000,
  downPaymentCents: 0, historicalPaidCents: 0, startMonth: "2026-10", schedule: { count: 12, paidCount: 0, firstDueDate: "2026-10-31" } };
const create = (patch: Partial<DebtSaveInput> = {}) => saveDebt(emptyFinanceData(), { ...input, ...patch });

describe("parcelamento combinado", () => {
  it("prevê 12 parcelas de 500 e mantém o saldo integral até pagar", () => {
    const data = create(), debt = data.debts[0];
    expect(data.expenses).toHaveLength(12);
    expect(data.expenses.every((e) => e.amountCents === 50000 && e.status === "planned" && e.cardId === null && e.debtId === debt.id)).toBe(true);
    expect(monthSummary(data, "2026-10")).toMatchObject({ paid: 0, planned: 50000, total: 50000 });
    expect(monthSummary(data, "2027-09").planned).toBe(50000);
    expect(monthSummary(data, "2027-10").total).toBe(0);
    expect(debtSummary(data, debt, today).remaining).toBe(600000);
    expect(debtInstallmentSummary(data, debt)).toMatchObject({ paidCount: 0, nextDueDate: "2026-10-31", lastDueDate: "2027-09-30" });
    expect(installmentSummaries(data, "2026-10")).toEqual([]);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it("antecipa uma parcela, edita a data e desfaz sem duplicar o gasto", () => {
    let data = create();
    const item = data.expenses[1];
    data = setDebtInstallmentPayment(data, item.id, today, today);
    expect(data.expenses).toHaveLength(12);
    expect(data.expenses[1]).toMatchObject({ id: item.id, date: today, dueDate: "2026-11-30", status: "paid" });
    expect(monthSummary(data, "2026-10")).toMatchObject({ paid: 50000, planned: 50000, total: 100000 });
    expect(monthSummary(data, "2026-11").total).toBe(0);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(550000);
    data = setDebtInstallmentPayment(data, item.id, "2026-09-30", today);
    expect(monthSummary(data, "2026-09").paid).toBe(50000);
    expect(monthSummary(data, "2026-10").paid).toBe(0);
    data = setDebtInstallmentPayment(data, item.id, null, today);
    expect(data.expenses[1]).toEqual(item);
    expect(monthSummary(data, "2026-11")).toMatchObject({ paid: 0, planned: 50000 });
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(600000);
  });
  it("considera três parcelas anteriores como histórico sem gastos retroativos", () => {
    const data = create({ schedule: { count: 12, paidCount: 3, firstDueDate: "2026-10-10" } });
    expect(data.expenses).toHaveLength(9);
    expect(data.expenses[0].installmentNumber).toBe(4);
    expect(data.debts[0].historicalPaidCents).toBe(150000);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(450000);
    expect(debtInstallmentSummary(data, data.debts[0]).paidCount).toBe(3);
    expect(monthSummary(data, "2026-09").total).toBe(0);
  });
  it("distribui centavos no total completo, incluindo histórico, e ajusta fevereiro", () => {
    const data = create({ originalCents: 10001, schedule: { count: 3, paidCount: 1, firstDueDate: "2027-01-31" } });
    expect(data.debts[0].historicalPaidCents).toBe(3334);
    expect(data.expenses.map((e) => [e.amountCents, e.dueDate])).toEqual([[3334, "2027-01-31"], [3333, "2027-02-28"]]);
    const leap = create({ schedule: { count: 3, paidCount: 0, firstDueDate: "2028-01-31" } });
    expect(leap.expenses.map((e) => e.dueDate)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
  it("permite calendário passado ou futuro, preserva atrasos e valida limites", () => {
    const data = create({ schedule: { count: 2, paidCount: 0, firstDueDate: "2026-08-05" } });
    expect(debtInstallmentSummary(data, data.debts[0]).nextDueDate).toBe("2026-08-05");
    expect(monthSummary(data, "2026-08").planned).toBe(300000);
    expect(() => create({ schedule: { count: 1, paidCount: 0, firstDueDate: today } })).toThrow("2 e 360");
    expect(() => create({ schedule: { count: 12, paidCount: 12, firstDueDate: today } })).toThrow("restante");
    expect(() => create({ schedule: { count: 12, paidCount: -1, firstDueDate: today } })).toThrow();
    expect(() => create({ originalCents: 1 })).toThrow("centavo");
    expect(() => create({ schedule: { count: 12, paidCount: 0, firstDueDate: "9999-12-01" } })).toThrow("9999");
    expect(() => setDebtInstallmentPayment(data, data.expenses[0].id, "2026-10-07", today)).toThrow("futura");
    expect(() => setDebtInstallmentPayment(data, data.expenses[0].id, "2026-02-30", today)).toThrow("data real");
  });
  it("exige parcela integral, protege o calendário e permite editar os dados gerais", () => {
    let data = create();
    const debt = data.debts[0], item = data.expenses[0];
    const payment = { description: "Pix", amountCents: 50000, category: debt.category, status: "paid" as const, date: today };
    expect(() => saveDebtPayment(data, debt.id, payment, undefined, today)).toThrow("parcela existente");
    expect(() => saveDebtPayment(data, debt.id, { ...payment, amountCents: 49999 }, item.id, today)).toThrow("integral");
    expect(() => saveExpense(data, { ...item, amountCents: 1 }, item.id)).toThrow("ações de pagamento");
    expect(() => editOccurrence(data, item, payment, "future")).toThrow("ações de pagamento");
    expect(() => removeOccurrence(data, item, "one")).toThrow("combinado");
    expect(() => saveDebt(data, { ...debt, originalCents: 700000 }, debt.id)).toThrow("cadastro");
    data = saveDebt(data, { ...debt, name: "Acordo carro", category: "Outros", creditor: "Meu pai" }, debt.id);
    expect(data.expenses.every((e) => e.category === "Outros" && e.description.includes("Acordo carro"))).toBe(true);
    data = saveDebtPayment(data, debt.id, payment, item.id, today);
    expect(data.expenses).toHaveLength(12);
    expect(data.expenses[0].status).toBe("paid");
  });
  it("rejeita parcelas removidas, alteradas, órfãs ou duplicadas ao restaurar", () => {
    const data = create(), item = data.expenses[0];
    for (const invalid of [
      { ...data, expenses: data.expenses.slice(1) },
      { ...data, expenses: [{ ...item, amountCents: 1 }, ...data.expenses.slice(1)] },
      { ...data, expenses: [{ ...item, dueDate: null }, ...data.expenses.slice(1)] },
      { ...data, expenses: [{ ...item, debtId: null }, ...data.expenses.slice(1)] },
      { ...data, expenses: [...data.expenses, { ...item, id: crypto.randomUUID() }] },
      { ...data, debts: [{ ...data.debts[0], historicalPaidCents: 1 }] },
      { ...data, debts: [{ ...data.debts[0], installmentPlanId: crypto.randomUUID() }] },
    ]) expect(financeSchema.safeParse(invalid).success).toBe(false);
  });
  it("grava dívida e parcelas atomicamente, detecta conflito e não perde dados na falha", async () => {
    let raw: string | null = null;
    const repo = new LocalFinanceRepository(() => ({ getItem: () => raw, setItem: (_key, value) => { raw = value; } }));
    const data = await repo.write(create(), 0);
    expect((await repo.read()).expenses).toHaveLength(12);
    await expect(repo.write(setDebtInstallmentPayment(data, data.expenses[0].id, today, today), 0)).rejects.toBeInstanceOf(StorageConflictError);
    const previous = raw;
    const failing = new LocalFinanceRepository(() => ({ getItem: () => raw, setItem: () => { throw new Error("quota"); } }));
    await expect(failing.write(setDebtInstallmentPayment(data, data.expenses[0].id, today, today), 1)).rejects.toThrow("Não foi possível salvar");
    expect(raw).toBe(previous);
  });
});
