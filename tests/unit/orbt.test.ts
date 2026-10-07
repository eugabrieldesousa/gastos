import { describe, expect, it } from "vitest";
import { addExpense, emptyFinanceData, financeSchema, monthSummary, parseBackup, saveBalanceTransfer, saveIncome, saveNote } from "../../src/lib/finance";
import { financialReport } from "../../src/lib/finance-report";

const input = { description: "Freela", amountCents: 75050, date: "2026-10-07", status: "received" as const };
describe("ganhos extras e notas", () => {
  it("soma ganhos recebidos, previstos e salário sem duplicar ao editar", () => {
    let data = saveIncome({ ...emptyFinanceData(), salaries: { "2026-10": 300000 } }, input);
    data = saveIncome(data, { ...input, description: "Próximo freela", status: "planned", amountCents: 20000 });
    data = addExpense(data, { description: "Conta", category: "Outros", amountCents: 100000, date: input.date, status: "planned", kind: "single" });
    expect(monthSummary(data, "2026-10")).toMatchObject({ salary: 300000, incomeReceived: 75050, incomePlanned: 20000, revenue: 395050, remaining: 295050 });
    data = saveIncome(data, { ...input, amountCents: 100000, date: "2026-11-02" }, data.incomes[0].id);
    expect(data.incomes).toHaveLength(2);
    expect(monthSummary(data, "2026-10").remaining).toBe(220000);
    expect(monthSummary(data, "2026-11")).toMatchObject({ salary: null, revenue: 100000, remaining: 100000 });
  });
  it("distingue salário ausente, zero e mês com ganhos sem salário", () => {
    expect(monthSummary(emptyFinanceData(), "2026-10").remaining).toBeNull();
    expect(monthSummary({ ...emptyFinanceData(), salaries: { "2026-10": 0 } }, "2026-10").remaining).toBe(0);
    const data = saveIncome(emptyFinanceData(), { ...input, status: "planned" });
    expect(monthSummary(data, "2026-10")).toMatchObject({ salary: null, incomeReceived: 0, incomePlanned: 75050, remaining: 75050 });
    const transferred = saveBalanceTransfer(data, "2026-10", 50000, "2026-10-07");
    expect(monthSummary({ ...transferred, salaries: { "2026-11": 0 } }, "2026-11").remaining).toBe(50000);
  });
  it("migra v4 sem perder histórico e restaura ganhos e notas na v5", () => {
    const original = { ...emptyFinanceData(), revision: 22, salaries: { "2026-10": 0 }, balanceTransfers: { "2026-09": 10000 } };
    const { incomes: _incomes, notes: _notes, ...old } = original;
    void _incomes; void _notes;
    expect(parseBackup(JSON.stringify({ ...old, version: 4 }))).toEqual(original);
    const note = { id: crypto.randomUUID(), title: "", content: "Minha ideia", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" };
    const data = saveNote(saveIncome(original, input), note);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    expect(financeSchema.safeParse({ ...data, notes: [note, note] }).success).toBe(false);
    expect(financeSchema.safeParse({ ...data, incomes: [data.incomes[0], data.incomes[0]] }).success).toBe(false);
    expect(() => saveIncome(data, { ...input, amountCents: 0 })).toThrow();
    expect(() => saveIncome(data, { ...input, date: "2026-02-30" })).toThrow();
  });
  it("relatório inclui meses com ganhos, projeções e regras sem expor notas", () => {
    const data = saveIncome(saveNote(emptyFinanceData(), { id: crypto.randomUUID(), title: "Privada", content: "Segredo", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" }), { ...input, date: "2026-11-02" });
    const report = financialReport(data, "2026-10", "2026-10-07");
    expect(report.contexto.aplicativo).toBe("Orbt");
    expect(report.meses_cadastrados.find((item) => item.mes === "2026-11")).toMatchObject({ ganhos_recebidos_centavos: 75050, receita_prevista_centavos: 75050, sobra_prevista_centavos: 75050 });
    expect(report.projecao_seis_meses[0].sobra_prevista_centavos).toBe(75050);
    expect(JSON.stringify(report)).not.toContain("Segredo");
  });
});
