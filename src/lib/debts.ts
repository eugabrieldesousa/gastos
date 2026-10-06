import {
  debtSchema, financeSchema, localToday, saveExpense, shiftMonth,
  type Debt, type ExpenseInput, type FinanceData,
} from "./finance";

/** Turn domain validation into readable messages while keeping the repository strict. */
export function validateFinance(data: FinanceData): FinanceData {
  const result = financeSchema.safeParse(data);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Dados inválidos.");
  return result.data;
}

export function saveDebt(data: FinanceData, input: Omit<Debt, "id">, id = crypto.randomUUID()): FinanceData {
  const debt = debtSchema.parse({ ...input, id });
  return validateFinance({ ...data, debts: data.debts.some((d) => d.id === id)
    ? data.debts.map((d) => d.id === id ? debt : d) : [...data.debts, debt] });
}

export function debtSummary(data: FinanceData, debt: Debt, today = localToday()) {
  const payments = data.expenses.filter((e) => e.debtId === debt.id && e.status === "paid")
    .sort((a, b) => b.date.localeCompare(a.date));
  const amortized = payments.reduce((sum, e) => sum + e.amountCents, debt.downPaymentCents + debt.historicalPaidCents);
  const remaining = debt.originalCents - amortized;
  const currentMonth = today.slice(0, 7);
  const months = [3, 2, 1].map((n) => shiftMonth(currentMonth, -n)).filter((m) => m >= debt.startMonth);
  const paidInWindow = payments.filter((e) => months.includes(e.date.slice(0, 7)))
    .reduce((sum, e) => sum + e.amountCents, 0);
  const averageCents = months.length ? Math.round(paidInWindow / months.length) : 0;
  // Use the exact rational mean for the ceiling; rounding money first could add a month.
  const monthsRemaining = remaining === 0 ? 0 : paidInWindow > 0 ? Math.ceil(remaining * months.length / paidInWindow) : null;
  const [year, month] = currentMonth.split("-").map(Number);
  const maxMonths = (9999 - year) * 12 + 12 - month;
  const endMonth = monthsRemaining !== null && monthsRemaining > 0 && monthsRemaining <= maxMonths
    ? shiftMonth(currentMonth, monthsRemaining) : null;
  return { payments, amortized, remaining, averageCents, months, monthsRemaining, endMonth };
}

export function saveDebtPayment(data: FinanceData, debtId: string, input: ExpenseInput, expenseId?: string, today = localToday()): FinanceData {
  const debt = data.debts.find((d) => d.id === debtId);
  if (!debt) throw new Error("Selecione uma dívida existente.");
  if (input.date > today) throw new Error("O pagamento real não pode ter uma data futura.");
  const existing = expenseId ? data.expenses.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !existing) throw new Error("O gasto selecionado não existe mais. Revise o pagamento.");
  if (existing && (existing.cardId || existing.seriesId || (existing.debtId && existing.debtId !== debtId)))
    throw new Error("Selecione um gasto direto, avulso ou desta dívida.");
  return validateFinance(saveExpense(data, {
    ...input, kind: "debt", debtId, status: "paid", cardId: null,
    seriesId: null, installmentCount: null, installmentNumber: null, purchaseDate: null,
  }, expenseId));
}
