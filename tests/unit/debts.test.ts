import { describe, expect, it } from "vitest";
import { debtSummary, parseDebtCostList, removeDebtCost, saveDebt, saveDebtCosts, saveDebtPayment, updateDebtCost } from "../../src/lib/debts";
import { emptyFinanceData, financeSchema, MAX_CENTS, monthSummary, parseBackup, removeOccurrence, saveCategory, saveExpense } from "../../src/lib/finance";
import { exampleCosts } from "../fixtures/debt-costs";

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

function createItemized() {
  return saveDebt(emptyFinanceData(), { name: "Reparos do carro", creditor: "Pai", category: "Carro", type: "itemized",
    description: "Custos de manutenção", costs: parseDebtCostList(exampleCosts).map((cost) => ({ ...cost, id: crypto.randomUUID() })),
    originalCents: 0, downPaymentCents: 10000, historicalPaidCents: 5000, startMonth: "2026-07" });
}

describe("dívidas por custos", () => {
  it("soma os 14 custos sem gerar despesas e preserva centavos e descrição", () => {
    const data = createItemized();
    expect(data.debts[0]).toMatchObject({ type: "itemized", originalCents: 260900, description: "Custos de manutenção" });
    expect(data.debts[0].costs).toHaveLength(14);
    expect(data.expenses).toEqual([]);
    expect(monthSummary(data, "2026-10").total).toBe(0);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(245900);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it("adiciona, edita e exclui custos preservando pagamentos e recalculando previsão", () => {
    let data = createItemized();
    const id = data.debts[0].id;
    data = saveDebtPayment(data, id, { ...payment, amountCents: 30000 }, undefined, today);
    const expenses = data.expenses;
    const forecast = debtSummary(data, data.debts[0], today);
    data = saveDebtCosts(data, id, [{ description: "Óleo", amountCents: 10001 }]);
    const cost = data.debts[0].costs.at(-1)!;
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(forecast.remaining + 10001);
    expect(debtSummary(data, data.debts[0], today).monthsRemaining).toBeGreaterThan(forecast.monthsRemaining!);
    data = updateDebtCost(data, id, cost.id, { description: "Óleo revisado", amountCents: 5001 });
    expect(data.debts[0].costs.at(-1)).toMatchObject({ id: cost.id, description: "Óleo revisado", amountCents: 5001 });
    data = removeDebtCost(data, id, cost.id);
    expect(debtSummary(data, data.debts[0], today)).toEqual(forecast);
    expect(data.expenses).toEqual(expenses);
  });
  it("reabre uma dívida quitada ao adicionar custo sem duplicar o pagamento", () => {
    let data = createItemized();
    const id = data.debts[0].id;
    data = saveDebtPayment(data, id, { ...payment, amountCents: 245900 }, undefined, today);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(0);
    data = saveDebtCosts(data, id, [{ description: "Nova peça", amountCents: 6500 }]);
    expect(debtSummary(data, data.debts[0], today).remaining).toBe(6500);
    expect(data.expenses).toHaveLength(1);
    expect(monthSummary(data, "2026-08").paid).toBe(245900);
  });
  it("impede redução abaixo de pagamentos, custos inválidos, total excessivo e troca de tipo", () => {
    let data = createItemized();
    const id = data.debts[0].id;
    data = saveDebtPayment(data, id, { ...payment, amountCents: 245900 }, undefined, today);
    const cost = data.debts[0].costs[0];
    expect(() => removeDebtCost(data, id, cost.id)).toThrow("pagamentos");
    expect(() => updateDebtCost(data, id, cost.id, { description: cost.description, amountCents: 1 })).toThrow("pagamentos");
    expect(() => saveDebtCosts(data, id, [{ description: "", amountCents: 1 }])).toThrow("descrição");
    expect(() => saveDebtCosts(data, id, [{ description: "Teste", amountCents: 0 }])).toThrow("maior");
    expect(() => saveDebtCosts(data, id, [{ description: "Teste", amountCents: MAX_CENTS }])).toThrow();
    expect(() => saveDebt(data, { ...data.debts[0], type: "fixed", costs: [] }, id)).toThrow("tipo");
    expect(() => saveDebt(data, { ...data.debts[0], costs: [] }, id)).toThrow();
    const single = saveDebt(data, { ...data.debts[0], costs: [cost], downPaymentCents: 0, historicalPaidCents: 0 });
    expect(() => removeDebtCost(single, single.debts[1].id, cost.id)).toThrow("pelo menos um");
    expect(() => updateDebtCost(data, id, crypto.randomUUID(), cost)).toThrow("não existe");
    expect(() => saveDebtCosts(create(), create().debts[0].id, [cost])).toThrow("existente");
    expect(data.debts[0].originalCents).toBe(260900);
  });
  it("valida total, identificadores e custos de valor fixo em backups", () => {
    const data = createItemized(), debt = data.debts[0];
    expect(financeSchema.safeParse({ ...data, debts: [{ ...debt, originalCents: 1 }] }).success).toBe(false);
    expect(financeSchema.safeParse({ ...data, debts: [{ ...debt, costs: [debt.costs[0], debt.costs[0]], originalCents: 150000 }] }).success).toBe(false);
    expect(financeSchema.safeParse({ ...data, debts: [{ ...debt, type: "fixed" }] }).success).toBe(false);
    expect(() => parseBackup(JSON.stringify({ ...data, debts: [{ ...debt, originalCents: 1 }] }))).toThrow("inválido");
  });
  it("lê dívidas v3 antigas como valor fixo sem alterar pagamentos ou valores", () => {
    const data = create();
    const { type: _type, costs: _costs, description: _description, ...old } = data.debts[0];
    void _type; void _costs; void _description;
    const migrated = parseBackup(JSON.stringify({ ...data, debts: [old] }));
    expect(migrated.debts[0]).toEqual({ ...old, type: "fixed", description: "", costs: [] });
    expect(migrated.version).toBe(3);
    expect(migrated.expenses).toEqual(data.expenses);
    expect(debtSummary(migrated, migrated.debts[0], today)).toEqual(debtSummary(data, data.debts[0], today));
  });
});

describe("colagem de custos", () => {
  it("aceita tabs, espaços, símbolo opcional, CRLF e preserva descrições", () => {
    expect(parseDebtCostList("\r\n Mecânico — por dia\tR$ 250,00\r\nGraxa/grafite — descrição pouco legível    30,01\r\nTaxa 1.234,56\n\n")).toEqual([
      { description: "Mecânico — por dia", amountCents: 25000 }, { description: "Graxa/grafite — descrição pouco legível", amountCents: 3001 },
      { description: "Taxa", amountCents: 123456 },
    ]);
  });
  it("aponta linhas inválidas e não retorna importação parcial", () => {
    expect(() => parseDebtCostList("Guincho 750,00\nPneu -10,00\n\nSem valor\nZero R$ 0,00")).toThrow("2, 4, 5");
    expect(() => parseDebtCostList(" ")).toThrow("pelo menos uma");
    for (const text of ["R$ 10,00", "Pneu 10.50", "Pneu R$ 1.00,00", "Pneu 10,999", `${"x".repeat(121)} 10,00`]) {
      expect(() => parseDebtCostList(text)).toThrow("linhas 1");
    }
  });
  it("preserva custos iguais como itens independentes", () => {
    expect(parseDebtCostList("Peça 65,00\nPeça 65,00")).toHaveLength(2);
  });
});
