import { describe, expect, it } from "vitest";
import {
  addExpense,
  dateInMonth,
  editOccurrence,
  emptyFinanceData,
  ensureInvoice,
  expensesForMonth,
  financeSchema,
  installmentSummaries,
  invoiceSummary,
  monthSummary,
  parseBackup,
  removeOccurrence,
  saveCard,
  saveCategory,
  saveExpense,
  setInvoicePaid,
  suggestInvoiceMonth,
  type NewExpense,
} from "../../src/lib/finance";

const base: NewExpense = {
  description: "Seguro do carro",
  amountCents: 10000,
  category: "Carro",
  date: "2026-10-31",
  status: "planned",
  kind: "single",
};
function withCard() {
  return saveCard(emptyFinanceData(), {
    name: "Nubank",
    closingDay: 25,
    dueDay: 5,
  });
}

describe("migração e categorias", () => {
  it("migra v1 preservando valores, datas, salários, revisão e situações", () => {
    const old = {
      version: 1,
      revision: 8,
      salaries: { "2026-10": 0 },
      expenses: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          description: "Mercado",
          category: "Alimentação",
          amountCents: 12345,
          date: "2026-10-05",
          status: "paid",
        },
      ],
    };
    const data = parseBackup(JSON.stringify(old));
    expect(data.version).toBe(6);
    expect(data.revision).toBe(8);
    expect(data.salaries).toEqual(old.salaries);
    expect(data.expenses[0]).toMatchObject({
      ...old.expenses[0],
      kind: "single",
      cardId: null,
    });
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it("cria e renomeia categorias sem perder registros ou recorrências", () => {
    let data = saveCategory(emptyFinanceData(), {
      name: "Estudos",
      color: "#123456",
      icon: "work",
    });
    const category = data.categories.at(-1)!;
    data = addExpense(data, {
      ...base,
      kind: "fixed",
      category: category.name,
    });
    data = saveCategory(data, { ...category, name: "Educação" }, category.id);
    expect(expensesForMonth(data, "2026-10")[0].category).toBe("Educação");
    expect(expensesForMonth(data, "2026-11")[0].category).toBe("Educação");
    expect(() =>
      saveCategory(data, {
        name: " educação ",
        color: "#123456",
        icon: "work",
      }),
    ).toThrow("Já existe");
    expect(financeSchema.parse(data)).toEqual(data);
  });
  it("mantém categorias arquivadas no histórico", () => {
    let data = addExpense(emptyFinanceData(), base);
    data = {
      ...data,
      categories: data.categories.map((c) =>
        c.name === "Carro" ? { ...c, archived: true } : c,
      ),
    };
    expect(monthSummary(financeSchema.parse(data), "2026-10").total).toBe(
      10000,
    );
  });
  it("rejeita referências inexistentes e faturas duplicadas", () => {
    const data = withCard();
    expect(() =>
      financeSchema.parse({
        ...data,
        expenses: [
          { ...addExpense(data, base).expenses[0], category: "Inexistente" },
        ],
      }),
    ).toThrow();
    const next = ensureInvoice(data, data.cards[0].id, "2026-10");
    expect(() =>
      financeSchema.parse({
        ...next,
        invoices: [
          ...next.invoices,
          { ...next.invoices[0], id: crypto.randomUUID() },
        ],
      }),
    ).toThrow();
  });
});

describe("cartões e faturas", () => {
  it("sugere meses considerando fechamento, vencimento e virada de ano", () => {
    const card = withCard().cards[0];
    expect(suggestInvoiceMonth(card, "2026-10-24")).toBe("2026-11");
    expect(suggestInvoiceMonth(card, "2026-10-25")).toBe("2026-12");
    expect(suggestInvoiceMonth(card, "2026-12-26")).toBe("2027-02");
    expect(
      suggestInvoiceMonth({ ...card, closingDay: 5, dueDay: 15 }, "2026-10-04"),
    ).toBe("2026-10");
    expect(
      suggestInvoiceMonth({ ...card, closingDay: 31, dueDay: 5 }, "2026-02-28"),
    ).toBe("2026-04");
  });
  it("soma compras e parcelas apenas uma vez e quita só a fatura selecionada", () => {
    let data = withCard();
    const cardId = data.cards[0].id;
    data = addExpense(data, {
      ...base,
      cardId,
      date: "2026-10-05",
      amountCents: 10001,
      kind: "installment",
      totalInstallments: 3,
    });
    data = addExpense(data, {
      ...base,
      cardId,
      date: "2026-10-05",
      amountCents: 5000,
    });
    const before = invoiceSummary(data, cardId, "2026-10");
    expect(before.singleTotal).toBe(5000);
    expect(before.installmentTotal).toBe(3334);
    expect(before.total).toBe(8334);
    data = setInvoicePaid(data, cardId, "2026-10", true);
    expect(monthSummary(data, "2026-10")).toMatchObject({
      total: 8334,
      paid: 8334,
      planned: 0,
    });
    expect(monthSummary(data, "2026-11")).toMatchObject({
      paid: 0,
      planned: 3334,
    });
    expect(data.expenses).toHaveLength(4);
    data = setInvoicePaid(data, cardId, "2026-10", false);
    expect(monthSummary(data, "2026-10").planned).toBe(8334);
  });
  it("bloqueia alterações em faturas quitadas, inclusive novas séries futuras", () => {
    let data = withCard();
    const cardId = data.cards[0].id;
    data = addExpense(data, { ...base, cardId, date: "2026-11-05" });
    data = setInvoicePaid(data, cardId, "2026-11", true);
    expect(() =>
      addExpense(data, { ...base, cardId, date: "2026-11-05" }),
    ).toThrow("Desfaça");
    expect(() =>
      addExpense(data, { ...base, cardId, date: "2026-10-05", kind: "fixed" }),
    ).toThrow("Desfaça");
    expect(() =>
      removeOccurrence(data, expensesForMonth(data, "2026-11")[0], "one"),
    ).toThrow("Desfaça");
    expect(() =>
      saveCard(data, { ...data.cards[0], dueDay: 10 }, cardId),
    ).toThrow("Desfaça");
  });
  it("uma ocorrência recorrente quitada não muda ao editar só outro mês", () => {
    let data = withCard();
    const cardId = data.cards[0].id;
    data = addExpense(data, {
      ...base,
      cardId,
      date: "2026-10-05",
      kind: "fixed",
    });
    data = setInvoicePaid(data, cardId, "2026-10", true);
    const next = expensesForMonth(data, "2026-11")[0];
    data = editOccurrence(data, next, { ...next, amountCents: 15000 }, "one");
    expect(monthSummary(data, "2026-10").paid).toBe(10000);
    expect(monthSummary(data, "2026-11").planned).toBe(15000);
  });
  it("não permite quitar fatura vazia", () => {
    const data = withCard();
    expect(() =>
      setInvoicePaid(data, data.cards[0].id, "2026-10", true),
    ).toThrow("Adicione gastos");
  });
});

describe("parcelamentos", () => {
  it("distribui o total em centavos sem perda ou parcelas zeradas", () => {
    const data = addExpense(emptyFinanceData(), {
      ...base,
      amountCents: 10001,
      kind: "installment",
      totalInstallments: 3,
    });
    expect(data.expenses.map((e) => e.amountCents)).toEqual([3334, 3334, 3333]);
    expect(data.expenses.map((e) => e.date)).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
    expect(data.expenses.reduce((sum, e) => sum + e.amountCents, 0)).toBe(
      10001,
    );
    expect(() =>
      addExpense(emptyFinanceData(), {
        ...base,
        amountCents: 1,
        kind: "installment",
        totalInstallments: 2,
      }),
    ).toThrow("um centavo");
  });
  it("cadastra parcelas em andamento sem inventar pagamentos anteriores", () => {
    let data = addExpense(emptyFinanceData(), {
      ...base,
      kind: "installment",
      totalInstallments: 10,
      firstInstallment: 4,
    });
    expect(data.expenses).toHaveLength(7);
    expect(data.expenses[0].installmentNumber).toBe(4);
    let plan = installmentSummaries(data, "2026-10")[0];
    expect(plan).toMatchObject({
      firstInstallment: 4,
      paidCount: 0,
      pendingCount: 7,
      remaining: 70000,
      lastMonth: "2027-04",
    });
    data = saveExpense(
      data,
      { ...data.expenses[0], status: "paid" },
      data.expenses[0].id,
    );
    plan = installmentSummaries(data, "2026-11")[0];
    expect(plan).toMatchObject({
      paidCount: 1,
      pendingCount: 6,
      remaining: 60000,
    });
    expect(plan.current?.installmentNumber).toBe(5);
  });
  it("aceita primeira fatura manual e preserva a data da compra", () => {
    const data = withCard();
    const next = addExpense(data, {
      ...base,
      cardId: data.cards[0].id,
      date: "2026-12-05",
      purchaseDate: "2026-10-01",
      kind: "installment",
      totalInstallments: 2,
    });
    expect(expensesForMonth(next, "2026-11")).toHaveLength(0);
    expect(expensesForMonth(next, "2026-12")[0].purchaseDate).toBe(
      "2026-10-01",
    );
    expect(expensesForMonth(next, "2027-01")).toHaveLength(1);
  });
  it("edita e remove apenas as parcelas escolhidas", () => {
    let data = addExpense(emptyFinanceData(), {
      ...base,
      kind: "installment",
      totalInstallments: 3,
    });
    const second = data.expenses[1];
    data = editOccurrence(
      data,
      second,
      { ...second, amountCents: 5000 },
      "future",
    );
    expect(data.expenses.map((e) => e.amountCents)).toEqual([3334, 5000, 5000]);
    data = removeOccurrence(data, data.expenses[2], "one");
    expect(data.expenses).toHaveLength(2);
    expect(() =>
      addExpense(data, {
        ...base,
        kind: "installment",
        totalInstallments: 3,
        firstInstallment: 4,
      }),
    ).toThrow("inicial");
  });
});

describe("recorrências e datas curtas", () => {
  it("projeta meses sem alterar o armazenamento e respeita o último mês", () => {
    const data = addExpense(emptyFinanceData(), {
      ...base,
      kind: "fixed",
      endMonth: "2027-02",
    });
    const snapshot = JSON.stringify(data);
    expect(expensesForMonth(data, "2026-11")[0].date).toBe("2026-11-30");
    expect(expensesForMonth(data, "2027-02")[0].date).toBe("2027-02-28");
    expect(expensesForMonth(data, "2027-03")).toHaveLength(0);
    expect(expensesForMonth(data, "2026-11")).toHaveLength(1);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("sobrescreve uma ocorrência sem duplicar ou mudar outros meses", () => {
    let data = addExpense(emptyFinanceData(), { ...base, kind: "fixed" });
    const november = expensesForMonth(data, "2026-11")[0];
    data = editOccurrence(
      data,
      november,
      { ...november, amountCents: 12000, status: "paid" },
      "one",
    );
    expect(monthSummary(data, "2026-11")).toMatchObject({
      paid: 12000,
      total: 12000,
    });
    expect(monthSummary(data, "2026-12").planned).toBe(10000);
    expect(expensesForMonth(data, "2026-11")).toHaveLength(1);
    expect(() =>
      editOccurrence(
        data,
        november,
        { ...november, date: "2026-12-01" },
        "one",
      ),
    ).toThrow("mês original");
  });
  it("altera futuras, preserva o passado e encerra a recorrência", () => {
    let data = addExpense(emptyFinanceData(), { ...base, kind: "fixed" });
    const november = expensesForMonth(data, "2026-11")[0];
    data = editOccurrence(
      data,
      november,
      { ...november, amountCents: 15000 },
      "future",
    );
    expect(monthSummary(data, "2026-10").total).toBe(10000);
    expect(monthSummary(data, "2026-11").total).toBe(15000);
    expect(monthSummary(data, "2026-12").total).toBe(15000);
    expect(expensesForMonth(data, "2026-12")[0].date).toBe("2026-12-31");
    data = removeOccurrence(
      data,
      expensesForMonth(data, "2026-12")[0],
      "future",
    );
    expect(expensesForMonth(data, "2026-12")).toHaveLength(0);
    expect(expensesForMonth(data, "2027-01")).toHaveLength(0);
    expect(financeSchema.parse(data)).toEqual(data);
  });
  it("exclui uma ocorrência e mantém a série", () => {
    let data = addExpense(emptyFinanceData(), { ...base, kind: "fixed" });
    data = removeOccurrence(data, expensesForMonth(data, "2026-11")[0], "one");
    expect(expensesForMonth(data, "2026-11")).toHaveLength(0);
    expect(expensesForMonth(data, "2026-12")).toHaveLength(1);
  });
  it("usa dia 31 novamente depois de fevereiro e considera ano bissexto", () => {
    let data = withCard();
    data = saveCard(data, { ...data.cards[0], dueDay: 31 }, data.cards[0].id);
    data = addExpense(data, {
      ...base,
      cardId: data.cards[0].id,
      date: "2028-02-29",
      kind: "fixed",
      dueDay: 31,
    });
    expect(expensesForMonth(data, "2028-03")[0].date).toBe("2028-03-31");
    expect(dateInMonth("2028-02", 31)).toBe("2028-02-29");
    expect(dateInMonth("2027-02", 31)).toBe("2027-02-28");
  });
});
