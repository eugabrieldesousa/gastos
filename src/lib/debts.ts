import {
  dateInMonth, debtCostSchema, debtSchema, financeSchema, installmentAmount, isValidDate, localToday, parseMoney, saveExpense, shiftMonth,
  type Debt, type DebtCost, type DebtInput, type ExpenseInput, type FinanceData,
} from "./finance";

/** Turn domain validation into readable messages while keeping the repository strict. */
export function validateFinance(data: FinanceData): FinanceData {
  const result = financeSchema.safeParse(data);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Dados inválidos.");
  return result.data;
}

export type DebtSaveInput = DebtInput & { schedule?: { count: number; paidCount: number; firstDueDate: string } };

export function saveDebt(data: FinanceData, input: DebtSaveInput, id = crypto.randomUUID()): FinanceData {
  const existing = data.debts.find((d) => d.id === id);
  const type = input.type ?? existing?.type ?? "fixed";
  if (existing && existing.type !== type) throw new Error("O tipo de uma dívida cadastrada não pode ser alterado.");
  if (type === "installment" && !existing) return createInstallmentDebt(data, input, id);
  if (existing?.type === "installment" && (input.originalCents !== existing.originalCents || input.startMonth !== existing.startMonth
    || input.downPaymentCents !== existing.downPaymentCents || input.historicalPaidCents !== existing.historicalPaidCents
    || (input.installmentPlanId !== undefined && input.installmentPlanId !== existing.installmentPlanId) || input.schedule))
    throw new Error("O valor, o histórico e o calendário do combinado são definidos no cadastro.");
  const costs = input.costs ?? existing?.costs ?? [];
  const { schedule: _schedule, ...fields } = input;
  void _schedule;
  const debt = debtSchema.parse({ ...fields, id, type, costs, installmentPlanId: input.installmentPlanId ?? existing?.installmentPlanId ?? null,
    originalCents: type === "itemized" ? costs.reduce((sum, cost) => sum + cost.amountCents, 0) : input.originalCents });
  return validateFinance({ ...data, expenses: type === "installment" ? data.expenses.map((e) => e.debtId === id
    ? { ...e, category: debt.category, description: installmentDescription(debt.name, e.installmentNumber!, e.installmentCount!) } : e) : data.expenses,
    debts: data.debts.some((d) => d.id === id)
    ? data.debts.map((d) => d.id === id ? debt : d) : [...data.debts, debt] });
}

const installmentDescription = (name: string, number: number, count: number) => `Parcela ${number}/${count} · ${name}`.slice(0, 120);

function createInstallmentDebt(data: FinanceData, input: DebtSaveInput, id: string): FinanceData {
  const schedule = input.schedule;
  if (!schedule || !Number.isInteger(schedule.count) || schedule.count < 2 || schedule.count > 360)
    throw new Error("Informe entre 2 e 360 parcelas.");
  const { count, paidCount, firstDueDate } = schedule;
  if (!Number.isInteger(paidCount) || paidCount < 0 || paidCount >= count) throw new Error("Informe quantas parcelas já pagou, mantendo pelo menos uma parcela restante.");
  if (!isValidDate(firstDueDate)) throw new Error("Informe um primeiro vencimento válido.");
  if (!Number.isSafeInteger(input.originalCents) || input.originalCents < count) throw new Error("O total deve permitir pelo menos um centavo por parcela.");
  const firstMonth = firstDueDate.slice(0, 7);
  const [year, month] = firstMonth.split("-").map(Number);
  if (count - paidCount - 1 > (9999 - year) * 12 + 12 - month) throw new Error("O último vencimento deve ocorrer até dezembro de 9999.");
  const planId = crypto.randomUUID();
  const { schedule: _schedule, ...fields } = input;
  void _schedule;
  const historicalPaidCents = Math.floor(input.originalCents / count) * paidCount + Math.min(input.originalCents % count, paidCount);
  const debt = debtSchema.parse({ ...fields, id, type: "installment", installmentPlanId: planId, costs: [],
    startMonth: firstMonth, downPaymentCents: 0, historicalPaidCents });
  const expenses = Array.from({ length: count - paidCount }, (_, offset) => {
    const number = paidCount + offset + 1;
    const dueDate = dateInMonth(shiftMonth(firstMonth, offset), Number(firstDueDate.slice(8)));
    return { id: crypto.randomUUID(), description: installmentDescription(debt.name, number, count), amountCents: installmentAmount(debt.originalCents, count, number),
      category: debt.category, date: dueDate, dueDate, status: "planned" as const, kind: "installment" as const,
      debtId: id, seriesId: planId, installmentNumber: number, installmentCount: count, cardId: null, purchaseDate: null };
  });
  return validateFinance({ ...data, debts: [...data.debts, debt], expenses: [...data.expenses, ...expenses],
    installments: [...data.installments, { id: planId, totalInstallments: count, firstInstallment: paidCount + 1, firstMonth }] });
}

export function debtInstallmentSummary(data: FinanceData, debt: Debt) {
  const plan = data.installments.find((p) => p.id === debt.installmentPlanId);
  if (!plan) throw new Error("Parcelamento da dívida inexistente.");
  const items = data.expenses.filter((e) => e.debtId === debt.id).sort((a, b) => a.installmentNumber! - b.installmentNumber!);
  const pending = items.filter((e) => e.status === "planned");
  return { plan, items, pending, historicalCount: plan.firstInstallment - 1,
    paidCount: plan.firstInstallment - 1 + items.filter((e) => e.status === "paid").length,
    nextDueDate: pending[0]?.dueDate ?? null, lastDueDate: items.at(-1)!.dueDate!,
    firstAmount: installmentAmount(debt.originalCents, plan.totalInstallments, 1),
    lastAmount: installmentAmount(debt.originalCents, plan.totalInstallments, plan.totalInstallments) };
}

export function setDebtInstallmentPayment(data: FinanceData, expenseId: string, date: string | null, today = localToday()): FinanceData {
  const item = data.expenses.find((e) => e.id === expenseId);
  const debt = data.debts.find((d) => d.id === item?.debtId);
  if (!item || item.kind !== "installment" || debt?.type !== "installment" || !item.dueDate)
    throw new Error("Selecione uma parcela do combinado existente.");
  if (date !== null && (!isValidDate(date) || date > today)) throw new Error("Informe a data real do pagamento, sem data futura.");
  return validateFinance({ ...data, expenses: data.expenses.map((e) => e.id === expenseId
    ? { ...e, status: date === null ? "planned" : "paid", date: date ?? e.dueDate! } : e) });
}

function itemizedDebt(data: FinanceData, debtId: string) {
  const debt = data.debts.find((d) => d.id === debtId);
  if (!debt || debt.type !== "itemized") throw new Error("Selecione uma dívida por custos existente.");
  return debt;
}

export function saveDebtCosts(data: FinanceData, debtId: string, inputs: Array<Omit<DebtCost, "id">>): FinanceData {
  const debt = itemizedDebt(data, debtId);
  if (!inputs.length) throw new Error("Adicione pelo menos um custo.");
  const costs = inputs.map((input) => debtCostSchema.parse({ ...input, id: crypto.randomUUID() }));
  return saveDebt(data, { ...debt, costs: [...debt.costs, ...costs] }, debtId);
}

export function updateDebtCost(data: FinanceData, debtId: string, costId: string, input: Omit<DebtCost, "id">): FinanceData {
  const debt = itemizedDebt(data, debtId);
  if (!debt.costs.some((cost) => cost.id === costId)) throw new Error("O custo não existe mais. Recarregue os dados.");
  const cost = debtCostSchema.parse({ ...input, id: costId });
  return saveDebt(data, { ...debt, costs: debt.costs.map((c) => c.id === costId ? cost : c) }, debtId);
}

export function removeDebtCost(data: FinanceData, debtId: string, costId: string): FinanceData {
  const debt = itemizedDebt(data, debtId);
  if (!debt.costs.some((cost) => cost.id === costId)) throw new Error("O custo não existe mais. Recarregue os dados.");
  if (debt.costs.length === 1) throw new Error("A dívida precisa manter pelo menos um custo.");
  return saveDebt(data, { ...debt, costs: debt.costs.filter((c) => c.id !== costId) }, debtId);
}

/** Parse the trailing BRL amount without splitting hyphens or notes in descriptions. */
export function parseDebtCostList(value: string): Array<Omit<DebtCost, "id">> {
  const costs: Array<Omit<DebtCost, "id">> = [];
  const invalid: number[] = [];
  value.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const match = line.trim().match(/^(.*?)\s+(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)$/);
    const description = match?.[1].trim() ?? "";
    const amountCents = match ? parseMoney(match[2]) : null;
    if (!description || description === "R$" || description.length > 120 || amountCents === null || amountCents <= 0) invalid.push(index + 1);
    else costs.push({ description, amountCents });
  });
  if (invalid.length) throw new Error(`Revise as linhas ${invalid.join(", ")}: informe descrição e valor positivo em reais no final de cada linha.`);
  if (!costs.length) throw new Error("Cole pelo menos uma linha com descrição e valor.");
  return costs;
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
  if (debt.type === "installment") {
    if (!existing || existing.debtId !== debtId || existing.kind !== "installment") throw new Error("Selecione a parcela existente deste combinado.");
    if (input.amountCents !== existing.amountCents) throw new Error("O pagamento deve corresponder ao valor integral da parcela.");
    return setDebtInstallmentPayment(data, existing.id, input.date, today);
  }
  if (existing && (existing.cardId || existing.seriesId || (existing.debtId && existing.debtId !== debtId)))
    throw new Error("Selecione um gasto direto, avulso ou desta dívida.");
  return validateFinance(saveExpense(data, {
    ...input, kind: "debt", debtId, status: "paid", cardId: null,
    seriesId: null, installmentCount: null, installmentNumber: null, purchaseDate: null,
  }, expenseId));
}
