import { describe, expect, it } from "vitest";
import { addExpense, emptyFinanceData, financeSchema, installmentSummaries, monthSummary, parseBackup, saveBalanceTransfer, saveCard, setInvoicePaid } from "../../src/lib/finance";
import { financialReport } from "../../src/lib/finance-report";
import { saveDebt, saveDebtPayment } from "../../src/lib/debts";

const today = "2026-12-05";
function fixture() {
  return addExpense({ ...emptyFinanceData(), salaries: { "2026-10": 285584, "2026-11": 410000 } }, {
    description: "Gastos de outubro", category: "Outros", date: "2026-10-01", amountCents: 252976, status: "paid", kind: "single",
  });
}

describe("sobras confirmadas", () => {
  it("transfere toda a sobra sem gerar receita ou gasto e não duplica na edição", () => {
    let data = fixture();
    data = addExpense(data, { description: "Gastos de novembro", category: "Outros", date: "2026-11-01", amountCents: 370956, status: "planned", kind: "single" });
    data = saveBalanceTransfer(data, "2026-10", 32608, today);
    expect(monthSummary(data, "2026-11")).toMatchObject({ ownRemaining: 39044, received: 32608, remaining: 71652, total: 370956 });
    expect(data.expenses).toHaveLength(2);
    data = saveBalanceTransfer(data, "2026-10", 10000, today);
    expect(monthSummary(data, "2026-11").remaining).toBe(49044);
    expect(Object.keys(data.balanceTransfers)).toEqual(["2026-10"]);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    expect(monthSummary(saveBalanceTransfer(data, "2026-10", null, today), "2026-11").remaining).toBe(39044);
  });
  it("preserva a transferência se o salário ou os gastos da origem mudarem", () => {
    const data = saveBalanceTransfer(fixture(), "2026-10", 32608, today);
    const edited = { ...data, salaries: { ...data.salaries, "2026-10": 0 } };
    expect(financeSchema.parse(edited).balanceTransfers["2026-10"]).toBe(32608);
    expect(monthSummary(edited, "2026-11").received).toBe(32608);
    expect(() => saveBalanceTransfer(edited, "2026-10", 32608, today)).toThrow("sobra disponível");
    expect(saveBalanceTransfer(edited, "2026-10", null, today).balanceTransfers).toEqual({});
  });
  it("distingue salário ausente de zero e não transfere déficits automaticamente", () => {
    const data = saveBalanceTransfer(fixture(), "2026-10", 10000, today);
    const withoutSalary = { ...data, salaries: { "2026-10": 285584 } };
    expect(monthSummary(withoutSalary, "2026-11")).toMatchObject({ salary: null, received: 10000, ownRemaining: null, remaining: null });
    expect(monthSummary({ ...withoutSalary, salaries: { ...withoutSalary.salaries, "2026-11": 0 } }, "2026-11").remaining).toBe(10000);
    expect(() => saveBalanceTransfer({ ...data, salaries: { "2026-10": 0 } }, "2026-10", 1, today)).toThrow();
    expect(monthSummary(data, "2026-12").received).toBe(0);
  });
  it.each([0, -1, 1.5, 32609, Number.NaN])("recusa valor inválido %s", (amount) => {
    expect(() => saveBalanceTransfer(fixture(), "2026-10", amount, today)).toThrow();
  });
  it("permite levar a sobra do mês atual para simular o seguinte", () => {
    const data = saveBalanceTransfer(fixture(), "2026-10", 32608, "2026-10-06");
    expect(monthSummary(data, "2026-11")).toMatchObject({ received: 32608, remaining: 442608 });
  });
  it("recusa meses futuros e inválidos; passa dezembro atual para janeiro", () => {
    for (const month of ["2027-01", "2026-13", "9999-12"]) expect(() => saveBalanceTransfer(fixture(), month, 1, today)).toThrow();
    const data = saveBalanceTransfer({ ...emptyFinanceData(), salaries: { "2026-12": 50000, "2027-01": 0 } }, "2026-12", 50000, today);
    expect(monthSummary(data, "2027-01").remaining).toBe(50000);
  });
  it("migra v2 e v3 sem inventar transferências nem alterar valores", () => {
    const { balanceTransfers: _transfers, ...v3 } = fixture();
    void _transfers;
    expect(parseBackup(JSON.stringify({ ...v3, version: 3 }))).toEqual({ ...v3, version: 4, balanceTransfers: {} });
    const { debts: _debts, bankSources: _sources, importRecords: _records, ...v2 } = v3;
    void _debts; void _sources; void _records;
    const migrated = parseBackup(JSON.stringify({ ...v2, version: 2, expenses: v2.expenses.map(({ debtId, dueDate, ...expense }) => {
      void debtId; void dueDate; return expense;
    }) }));
    expect(migrated.version).toBe(4);
    expect(migrated.balanceTransfers).toEqual({});
    expect(migrated.expenses).toEqual(v3.expenses);
  });
  it("rejeita transferências inválidas na restauração", () => {
    for (const balanceTransfers of [{ "2026-13": 1 }, { "2026-10": 0 }, { "2026-10": 1.5 }, { "9999-12": 10 }])
      expect(() => parseBackup(JSON.stringify({ ...fixture(), balanceTransfers }))).toThrow("Backup inválido");
  });
});

describe("posição dos parcelamentos", () => {
  it.each([[4, 5, 80], [5, 12, 100 * 5 / 12]])("mostra parcela %s/%s sem inventar quitações", (first, count, progress) => {
    let data = addExpense(emptyFinanceData(), { description: "Compra", amountCents: 10000, category: "Outros", date: "2026-11-01",
      status: "planned", kind: "installment", totalInstallments: count, firstInstallment: first });
    expect(installmentSummaries(data, "2026-11")[0]).toMatchObject({ position: first, paidCount: 0, pendingCount: count - first + 1 });
    expect(installmentSummaries(data, "2026-11")[0].progressPercent).toBeCloseTo(progress);
    data = { ...data, expenses: data.expenses.map((item, index) => index ? item : { ...item, status: "paid" }) };
    expect(installmentSummaries(data, "2026-11")[0].paidCount).toBe(1);
    expect(installmentSummaries(data, "2026-12")[0].position).toBe(first + 1);
    expect(installmentSummaries(data, "2026-10")[0].position).toBe(0);
  });
});

describe("relatório para IA", () => {
  it("explica e reconcilia faturas, recorrências, sobras e dívidas sem expor rastreabilidade", () => {
    let data = saveCard(fixture(), { name: "Meu cartão", closingDay: 25, dueDay: 5 });
    data = addExpense(data, { description: "Assinatura", category: "Assinaturas", date: "2026-11-05", amountCents: 5000, status: "planned", kind: "fixed", cardId: data.cards[0].id });
    data = addExpense(data, { description: "Compra futura", category: "Outros", date: "2026-12-05", amountCents: 1000, status: "planned", cardId: data.cards[0].id, kind: "single" });
    data = setInvoicePaid(data, data.cards[0].id, "2026-12", true);
    data = saveBalanceTransfer(data, "2026-10", 10000, today);
    data = saveDebt(data, { name: "Empréstimo", creditor: "Pessoa", originalCents: 100000, downPaymentCents: 10000, historicalPaidCents: 5000, category: "Outros", startMonth: "2026-10" });
    data = saveDebtPayment(data, data.debts[0].id, { description: "Pagamento", amountCents: 20000, category: "Outros", status: "paid", date: "2026-11-02" }, undefined, today);
    const report = financialReport(data, "2026-11", today);
    const month = report.meses_cadastrados.find((item) => item.mes === "2026-11")!;
    expect(month.gastos.reduce((sum, item) => sum + item.valor_centavos, 0)).toBe(month.gastos_centavos);
    expect(month).toMatchObject({ sobra_recebida_centavos: 10000, gastos_centavos: 25000, sobra_prevista_centavos: 395000 });
    expect(month.faturas[0]).toMatchObject({ cartao: "Meu cartão", total_centavos: 5000 });
    expect(report.projecao_seis_meses).toHaveLength(6);
    expect(report.projecao_seis_meses[0]).toMatchObject({ salario_centavos: null, sobra_prevista_centavos: null, pagos_centavos: 6000 });
    expect(report.compromissos_futuros_cadastrados).toEqual([]);
    expect(report.dividas[0]).toMatchObject({ total_amortizado_centavos: 35000, saldo_devedor_centavos: 65000 });
    expect(JSON.stringify(report)).not.toMatch(/sourceId|fileHash|importRecords|bankSources/);
    expect(() => parseBackup(JSON.stringify(report))).toThrow("Backup inválido");
  });
});
