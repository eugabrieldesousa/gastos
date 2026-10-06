import { describe, expect, it } from "vitest";
import {
  emptyFinanceData,
  expensesForMonth,
  isValidDate,
  monthSummary,
  parseBackup,
  parseMoney,
  saveExpense,
  shiftMonth,
  type ExpenseInput,
  type FinanceData,
} from "../../src/lib/finance";

const input: ExpenseInput = {
  description: "Mercado",
  amountCents: 120_000,
  category: "Alimentação",
  date: "2026-10-05",
  status: "paid",
};
const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("valores brasileiros", () => {
  it.each([
    ["5.000,00", 500_000],
    ["0,10", 10],
    ["0,2", 20],
    ["R$ 1.234,56", 123456],
    ["0", 0],
    ["12", 1200],
  ])("converte %s para centavos", (value, expected) => {
    expect(parseMoney(value)).toBe(expected);
  });
  it.each(["", "-10", "1,234", "1.23", "1e4", "abc", "1,2,3", "1000000001"])(
    'rejeita "%s"',
    (value) => expect(parseMoney(value)).toBeNull(),
  );
});

describe("resumo mensal", () => {
  it("mantém a sobra quando um gasto previsto é pago", () => {
    let data: FinanceData = {
      ...emptyFinanceData(),
      salaries: { "2026-10": 500_000 },
    };
    data = saveExpense(data, input, id);
    data = saveExpense(
      data,
      { ...input, amountCents: 80_000, status: "planned" },
      secondId,
    );
    expect(monthSummary(data, "2026-10")).toMatchObject({
      salary: 500_000,
      paid: 120_000,
      planned: 80_000,
      remaining: 300_000,
    });
    data = saveExpense(
      data,
      { ...input, amountCents: 80_000, status: "paid" },
      secondId,
    );
    expect(data.expenses).toHaveLength(2);
    expect(monthSummary(data, "2026-10")).toMatchObject({
      paid: 200_000,
      planned: 0,
      remaining: 300_000,
    });
  });
  it("distingue salário ausente de zero e permite sobra negativa", () => {
    const data = saveExpense(
      emptyFinanceData(),
      { ...input, amountCents: 10 },
      id,
    );
    expect(monthSummary(data, "2026-10").remaining).toBeNull();
    expect(
      monthSummary({ ...data, salaries: { "2026-10": 0 } }, "2026-10")
        .remaining,
    ).toBe(-10);
  });
  it("soma centavos sem erro de ponto flutuante", () => {
    let data = saveExpense(
      emptyFinanceData(),
      { ...input, amountCents: parseMoney("0,10")! },
      id,
    );
    data = saveExpense(
      data,
      { ...input, amountCents: parseMoney("0,20")! },
      secondId,
    );
    expect(monthSummary(data, "2026-10").paid).toBe(30);
  });
  it("isola meses e filtra o status sem mudar o resumo", () => {
    let data = saveExpense(emptyFinanceData(), input, id);
    data = saveExpense(
      data,
      { ...input, date: "2026-11-01", status: "planned" },
      secondId,
    );
    expect(expensesForMonth(data, "2026-10")).toHaveLength(1);
    expect(expensesForMonth(data, "2026-11", "paid")).toHaveLength(0);
    expect(monthSummary(data, "2026-11").planned).toBe(120_000);
  });
});

describe("datas e backups", () => {
  it("valida datas reais e a virada de ano", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("preserva todos os dados no round-trip", () => {
    const data = saveExpense(
      { ...emptyFinanceData(), salaries: { "2026-10": 0, "2026-11": 500000 } },
      input,
      id,
    );
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it("rejeita versões incompatíveis, dinheiro fracionário, datas e ids inválidos", () => {
    const data = saveExpense(emptyFinanceData(), input, id);
    const invalid = [
      "not json",
      "null",
      JSON.stringify({ ...data, version: 4 }),
      JSON.stringify({ ...data, salaries: { "2026-13": 0 } }),
      JSON.stringify({
        ...data,
        expenses: [{ ...data.expenses[0], amountCents: 1.5 }],
      }),
      JSON.stringify({
        ...data,
        expenses: [{ ...data.expenses[0], date: "2026-02-30" }],
      }),
      JSON.stringify({
        ...data,
        expenses: [data.expenses[0], data.expenses[0]],
      }),
    ];
    for (const text of invalid)
      expect(() => parseBackup(text)).toThrow("Backup inválido");
  });
});
