import { z } from "zod";

export const CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Música",
  "Carro",
  "Trabalho",
  "Telefonia e internet",
  "Assinaturas",
  "Outros",
] as const;
export const MAX_CENTS = 100_000_000_000;
const centsSchema = z.number().int().min(0).max(MAX_CENTS);
const monthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);

export function isValidDate(value: string): boolean {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const legacyExpenseSchema = z
  .object({
    id: z.string().uuid(),
    description: z.string().trim().min(1).max(120),
    amountCents: centsSchema.refine((value) => value > 0),
    category: z.enum(CATEGORIES),
    date: z.string().refine(isValidDate),
    status: z.enum(["planned", "paid"]),
  })
  .strict();

const legacyFinanceSchema = z
  .object({
    version: z.literal(1),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    salaries: z.record(monthSchema, centsSchema),
    expenses: z.array(legacyExpenseSchema).max(10_000),
  })
  .strict()
  .refine(
    (data) =>
      new Set(data.expenses.map((expense) => expense.id)).size ===
      data.expenses.length,
    {
      message: "O backup contém gastos duplicados.",
    },
  );

export const CATEGORY_ICONS = [
  "home",
  "food",
  "bus",
  "health",
  "leisure",
  "music",
  "car",
  "work",
  "phone",
  "subscription",
  "other",
] as const;
export const CATEGORY_COLORS = [
  "#31745b",
  "#d19845",
  "#608fbc",
  "#ba7184",
  "#8d79b5",
  "#577eb5",
  "#89984d",
  "#577e85",
  "#cb8662",
  "#a06ca1",
  "#85918a",
] as const;
export const KIND_LABELS = {
  single: "Avulso",
  fixed: "Fixo",
  installment: "Parcelado",
  debt: "Dívida",
} as const;
const categorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icon: z.enum(CATEGORY_ICONS),
    archived: z.boolean(),
  })
  .strict();
const cardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    closingDay: z.number().int().min(1).max(31),
    dueDay: z.number().int().min(1).max(31),
  })
  .strict();
const invoiceSchema = z
  .object({
    id: z.string().uuid(),
    cardId: z.string().uuid(),
    month: monthSchema,
    paid: z.boolean(),
  })
  .strict();
const expenseV2Schema = z
  .object({
    id: z
      .string()
      .regex(
        /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|rec:[0-9a-f-]{36}:[1-9]\d{3}-(?:0[1-9]|1[0-2]))$/i,
      ),
    description: z.string().trim().min(1).max(120),
    amountCents: centsSchema.refine((v) => v > 0),
    category: z.string().min(1).max(60),
    date: z.string().refine(isValidDate),
    status: z.enum(["planned", "paid"]),
    kind: z.enum(["single", "fixed", "installment"]).default("single"),
    cardId: z.string().uuid().nullable().default(null),
    seriesId: z.string().uuid().nullable().default(null),
    installmentNumber: z
      .number()
      .int()
      .min(1)
      .max(360)
      .nullable()
      .default(null),
    installmentCount: z.number().int().min(2).max(360).nullable().default(null),
    purchaseDate: z.string().refine(isValidDate).nullable().default(null),
  })
  .strict();
export const expenseSchema = expenseV2Schema.extend({
  kind: z.enum(["single", "fixed", "installment", "debt"]).default("single"),
  debtId: z.string().uuid().nullable().default(null),
});

export const debtCostSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1, "Informe a descrição do custo.").max(120),
  amountCents: centsSchema.refine((v) => v > 0, "O custo deve ser maior que zero."),
}).strict();
export const debtSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  creditor: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(60),
  originalCents: centsSchema.refine((v) => v > 0),
  downPaymentCents: centsSchema,
  historicalPaidCents: centsSchema,
  startMonth: monthSchema,
  type: z.enum(["fixed", "itemized"]).default("fixed"),
  description: z.string().trim().max(1000).default(""),
  costs: z.array(debtCostSchema).max(10000).default([]),
}).strict().superRefine((debt, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (debt.type === "fixed" && debt.costs.length) issue("Dívidas de valor fixo não podem ter custos detalhados.");
  if (debt.type === "itemized") {
    if (!debt.costs.length) issue("Adicione pelo menos um custo à dívida.");
    if (new Set(debt.costs.map((cost) => cost.id)).size !== debt.costs.length) issue("Custos duplicados.");
    const total = debt.costs.reduce((sum, cost) => sum + cost.amountCents, 0);
    if (!Number.isSafeInteger(total) || total > MAX_CENTS) issue("O total dos custos ultrapassa o limite permitido.");
    if (debt.originalCents !== total) issue("O total da dívida deve ser igual à soma dos custos.");
  }
});
const column = z.number().int().min(0).max(1000);
export const columnMappingSchema = z.object({
  sheet: z.string().max(120),
  headerRow: z.number().int().min(0).max(100000),
  date: column,
  description: column,
  amount: column.nullable(),
  debit: column.nullable(),
  credit: column.nullable(),
  direction: column.nullable(),
  externalId: column.nullable(),
  expenseSign: z.enum(["negative", "positive"]),
}).strict();
export const bankSourceSchema = z.object({
  id: z.string().uuid(),
  bank: z.enum(["bb", "mercado-pago", "itau"]),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["account", "card"]),
  cardId: z.string().uuid().nullable(),
  mapping: columnMappingSchema.nullable(),
}).strict();
const importRecordSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  key: z.string().min(1).max(1024),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  row: z.number().int().nonnegative(),
  date: z.string().refine(isValidDate).nullable(),
  description: z.string().min(1).max(120),
  signedAmountCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS).nullable(),
  externalId: z.string().min(1).max(255).nullable(),
  action: z.enum(["create", "link", "debt", "invoice", "ignore"]),
  expenseId: expenseSchema.shape.id.nullable(),
  cardId: z.string().uuid().nullable(),
  invoiceMonth: monthSchema.nullable(),
}).strict();
const recurrenceSchema = z
  .object({
    id: z.string().uuid(),
    description: z.string().trim().min(1).max(120),
    amountCents: centsSchema.refine((v) => v > 0),
    category: z.string().min(1).max(60),
    startMonth: monthSchema,
    endMonth: monthSchema.nullable(),
    day: z.number().int().min(1).max(31),
    cardId: z.string().uuid().nullable(),
    skippedMonths: z.array(monthSchema).max(10000),
  })
  .strict();
const installmentSchema = z
  .object({
    id: z.string().uuid(),
    totalInstallments: z.number().int().min(2).max(360),
    firstInstallment: z.number().int().min(1).max(360),
    firstMonth: monthSchema,
  })
  .strict();
const financeV2Object = z
  .object({
    version: z.literal(2),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    salaries: z.record(monthSchema, centsSchema),
    expenses: z.array(expenseV2Schema).max(100000),
    categories: z.array(categorySchema).min(1).max(500),
    cards: z.array(cardSchema).max(100),
    invoices: z.array(invoiceSchema).max(10000),
    recurrences: z.array(recurrenceSchema).max(10000),
    installments: z.array(installmentSchema).max(10000),
  })
  .strict();
function validateCore(data: Omit<z.infer<typeof financeV2Object>, "version" | "expenses"> & {
  expenses: Array<Omit<z.infer<typeof expenseV2Schema>, "kind"> & { kind: string }>;
}, ctx: z.RefinementCtx) {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    for (const collection of [
      data.expenses,
      data.categories,
      data.cards,
      data.invoices,
      data.recurrences,
      data.installments,
    ]) {
      if (new Set(collection.map((v) => v.id)).size !== collection.length)
        issue("Registros duplicados.");
    }
    if (
      new Set(data.categories.map((v) => v.name.toLocaleLowerCase("pt-BR")))
        .size !== data.categories.length
    )
      issue("Categorias duplicadas.");
    if (
      new Set(data.invoices.map((v) => `${v.cardId}:${v.month}`)).size !==
      data.invoices.length
    )
      issue("Faturas duplicadas.");
    const cards = new Set(data.cards.map((v) => v.id));
    const categories = new Set(data.categories.map((v) => v.name));
    const recurrences = new Set(data.recurrences.map((v) => v.id));
    const installments = new Map(data.installments.map((v) => [v.id, v]));
    const occurrences = new Set<string>();
    if (
      !Number.isSafeInteger(
        data.expenses.reduce((sum, e) => sum + e.amountCents, 0),
      )
    )
      issue("O total ultrapassa o limite de precisão.");
    for (const item of [...data.expenses, ...data.recurrences]) {
      if (!categories.has(item.category)) issue("Categoria inexistente.");
      if (item.cardId && !cards.has(item.cardId)) issue("Cartão inexistente.");
    }
    for (const invoice of data.invoices)
      if (!cards.has(invoice.cardId)) issue("Cartão da fatura inexistente.");
    for (const rule of data.recurrences)
      if (rule.endMonth && rule.endMonth < rule.startMonth)
        issue("Período da recorrência inválido.");
    for (const plan of data.installments)
      if (plan.firstInstallment > plan.totalInstallments)
        issue("Parcela inicial inválida.");
    for (const expense of data.expenses) {
      if (
        expense.kind === "single" &&
        (expense.seriesId ||
          expense.installmentNumber ||
          expense.installmentCount)
      )
        issue("Gasto avulso inválido.");
      if (expense.kind === "fixed") {
        if (!expense.seriesId || !recurrences.has(expense.seriesId))
          issue("Recorrência inexistente.");
        if (expense.installmentNumber || expense.installmentCount)
          issue("Ocorrência fixa inválida.");
        const key = `${expense.seriesId}:${expense.date.slice(0, 7)}`;
        if (occurrences.has(key)) issue("Ocorrência duplicada.");
        occurrences.add(key);
      }
      if (expense.kind === "installment") {
        const plan = expense.seriesId
          ? installments.get(expense.seriesId)
          : undefined;
        if (
          !plan ||
          !expense.installmentNumber ||
          expense.installmentCount !== plan.totalInstallments ||
          expense.installmentNumber < plan.firstInstallment ||
          expense.installmentNumber > plan.totalInstallments
        )
          issue("Parcelamento inválido.");
        const key = `${expense.seriesId}:${expense.installmentNumber}`;
        if (occurrences.has(key)) issue("Parcela duplicada.");
        occurrences.add(key);
      }
    }
}
const financeV2Schema = financeV2Object.superRefine(validateCore);
export const financeSchema = financeV2Object.extend({
  version: z.literal(3),
  expenses: z.array(expenseSchema).max(100000),
  debts: z.array(debtSchema).max(10000),
  bankSources: z.array(bankSourceSchema).max(200),
  importRecords: z.array(importRecordSchema).max(100000),
}).superRefine(validateCore).superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const list of [data.debts, data.bankSources, data.importRecords]) {
    if (new Set(list.map((v) => v.id)).size !== list.length) issue("Registros duplicados.");
  }
  const debts = new Map(data.debts.map((d) => [d.id, d]));
  const categories = new Set(data.categories.map((c) => c.name));
  for (const debt of data.debts) {
    if (!categories.has(debt.category)) issue("Categoria da dívida inexistente.");
    const paid = data.expenses.filter((e) => e.debtId === debt.id && e.status === "paid")
      .reduce((sum, e) => sum + e.amountCents, debt.downPaymentCents + debt.historicalPaidCents);
    if (paid > debt.originalCents) issue(debt.type === "itemized"
      ? "O total dos custos não pode ser menor que a entrada, o histórico e os pagamentos já registrados. Revise o saldo da dívida."
      : "O pagamento ultrapassa o saldo da dívida.");
  }
  for (const expense of data.expenses) {
    if (expense.kind === "debt") {
      const debt = expense.debtId ? debts.get(expense.debtId) : undefined;
      if (!debt) issue("Selecione uma dívida existente.");
      if (expense.cardId || expense.seriesId || expense.installmentCount || expense.installmentNumber || expense.status !== "paid")
        issue("Pagamentos de dívida devem ser pagos diretamente, sem parcelamento ou cartão.");
      if (debt && expense.date.slice(0, 7) < debt.startMonth) issue("O pagamento é anterior ao início do acompanhamento da dívida.");
    } else if (expense.debtId) issue("Somente pagamentos de dívida podem ter vínculo com uma dívida.");
  }
  const sources = new Map(data.bankSources.map((s) => [s.id, s]));
  if (new Set(data.bankSources.map((s) => `${s.bank}:${s.kind}:${s.name.toLocaleLowerCase("pt-BR")}`)).size !== data.bankSources.length)
    issue("Já existe uma origem com este banco, tipo e identificação.");
  for (const source of data.bankSources) {
    if (source.kind === "card" ? !data.cards.some((c) => c.id === source.cardId) : source.cardId !== null)
      issue("Selecione um cartão válido para a origem.");
  }
  if (new Set(data.importRecords.map((r) => `${r.sourceId}:${r.key}`)).size !== data.importRecords.length)
    issue("Transações importadas duplicadas.");
  for (const record of data.importRecords) {
    if (!sources.has(record.sourceId)) issue("Origem da importação inexistente.");
    if (record.cardId && !data.cards.some((c) => c.id === record.cardId)) issue("Cartão da importação inexistente.");
    if (record.action !== "ignore" && (!record.date || record.signedAmountCents === null || record.signedAmountCents >= 0))
      issue("O registro importado deve corresponder a uma saída válida.");
    if (["create", "link", "debt"].includes(record.action) && !record.expenseId) issue("O registro importado deve identificar o gasto vinculado.");
    if (record.action === "invoice" && (!record.cardId || !record.invoiceMonth)) issue("O pagamento importado deve identificar a fatura.");
  }
});
export type Debt = z.infer<typeof debtSchema>;
export type DebtInput = Omit<z.input<typeof debtSchema>, "id">;
export type DebtCost = z.infer<typeof debtCostSchema>;
export type BankSource = z.infer<typeof bankSourceSchema>;
export type ColumnMapping = z.infer<typeof columnMappingSchema>;
export type ImportRecord = z.infer<typeof importRecordSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreditCard = z.infer<typeof cardSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type FinanceData = z.infer<typeof financeSchema>;
export type ExpenseInput = Pick<
  Expense,
  "description" | "amountCents" | "category" | "date" | "status"
> &
  Partial<
    Omit<
      Expense,
      "id" | "description" | "amountCents" | "category" | "date" | "status"
    >
  >;
export type ExpenseFilter = "all" | Expense["status"];

export function emptyFinanceData(): FinanceData {
  return {
    version: 3,
    revision: 0,
    salaries: {},
    expenses: [],
    categories: CATEGORIES.map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name,
      color: CATEGORY_COLORS[index],
      icon: CATEGORY_ICONS[index],
      archived: false,
    })),
    cards: [],
    invoices: [],
    recurrences: [],
    installments: [],
    debts: [],
    bankSources: [],
    importRecords: [],
  };
}

export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/^R\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.replaceAll(".", "").split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

const currencyFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export function formatMoney(cents: number): string {
  return currencyFormat.format(cents / 100);
}

export function moneyInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

export function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(" de ", " ");
}

export function expensesForMonth(
  data: FinanceData,
  month: string,
  filter: ExpenseFilter = "all",
): Expense[] {
  if (!month) return [];
  const stored = data.expenses.filter((e) => e.date.slice(0, 7) === month);
  const overrides = new Set(
    stored.filter((e) => e.kind === "fixed").map((e) => e.seriesId),
  );
  const recurring = data.recurrences
    .filter(
      (rule) =>
        rule.startMonth <= month &&
        (!rule.endMonth || month <= rule.endMonth) &&
        !rule.skippedMonths.includes(month),
    )
    .filter((rule) => !overrides.has(rule.id))
    .map((rule) =>
      expenseSchema.parse({
        id: `rec:${rule.id}:${month}`,
        description: rule.description,
        amountCents: rule.amountCents,
        category: rule.category,
        date: dateInMonth(month, rule.day),
        status: "planned",
        kind: "fixed",
        cardId: rule.cardId,
        seriesId: rule.id,
      }),
    );
  return [...stored, ...recurring]
    .map((expense) =>
      expense.cardId
        ? {
            ...expense,
            status: invoiceFor(data, expense.cardId, expense.date.slice(0, 7))
              .paid
              ? ("paid" as const)
              : ("planned" as const),
          }
        : expense,
    )
    .filter(
      (expense) =>
        expense.date.slice(0, 7) === month &&
        (filter === "all" || expense.status === filter),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.description.localeCompare(b.description, "pt-BR"),
    );
}

export function monthSummary(data: FinanceData, month: string) {
  const expenses = expensesForMonth(data, month);
  const salary = data.salaries[month] ?? null;
  const paid = expenses.reduce(
    (total, expense) =>
      total + (expense.status === "paid" ? expense.amountCents : 0),
    0,
  );
  const planned = expenses.reduce(
    (total, expense) =>
      total + (expense.status === "planned" ? expense.amountCents : 0),
    0,
  );
  return {
    salary,
    paid,
    planned,
    total: paid + planned,
    remaining: salary === null ? null : salary - paid - planned,
  };
}

export function saveExpense(
  data: FinanceData,
  input: ExpenseInput,
  id: string = crypto.randomUUID(),
): FinanceData {
  const expense = expenseSchema.parse({ ...input, id });
  assertEditable(data, [expense, ...data.expenses.filter((e) => e.id === id)]);
  const exists = data.expenses.some((item) => item.id === id);
  const next = {
    ...data,
    expenses: exists
      ? data.expenses.map((item) => (item.id === id ? expense : item))
      : [...data.expenses, expense],
  };
  if (expense.kind === "debt" || data.expenses.find((e) => e.id === id)?.kind === "debt") {
    const result = financeSchema.safeParse(next);
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Pagamento de dívida inválido.");
    return result.data;
  }
  return next;
}

export function parseBackup(text: string): FinanceData {
  try {
    return parseFinanceData(JSON.parse(text));
  } catch {
    throw new Error(
      "Backup inválido. Selecione um arquivo JSON exportado por este aplicativo.",
    );
  }
}

export function parseFinanceData(value: unknown): FinanceData {
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1
  ) {
    const legacy = legacyFinanceSchema.parse(value);
    return financeSchema.parse({
      ...emptyFinanceData(),
      revision: legacy.revision,
      salaries: legacy.salaries,
      expenses: legacy.expenses.map((e) => expenseSchema.parse(e)),
    });
  }
  if (typeof value === "object" && value !== null && "version" in value && value.version === 2) {
    const old = financeV2Schema.parse(value);
    return financeSchema.parse({ ...old, version: 3, expenses: old.expenses.map((e) => expenseSchema.parse(e)), debts: [], bankSources: [], importRecords: [] });
  }
  return financeSchema.parse(value);
}

export function dateInMonth(month: string, day: number): string {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** The closing date starts the next cycle. The due date follows that cycle's closing. */
export function suggestInvoiceMonth(
  card: CreditCard,
  purchaseDate: string,
): string {
  let closingMonth = purchaseDate.slice(0, 7);
  if (purchaseDate >= dateInMonth(closingMonth, card.closingDay))
    closingMonth = shiftMonth(closingMonth, 1);
  return card.dueDay <= card.closingDay
    ? shiftMonth(closingMonth, 1)
    : closingMonth;
}

export function invoiceFor(data: FinanceData, cardId: string, month: string) {
  const card = data.cards.find((c) => c.id === cardId)!;
  const saved = data.invoices.find(
    (i) => i.cardId === cardId && i.month === month,
  );
  return {
    cardId,
    month,
    paid: saved?.paid ?? false,
    dueDate: dateInMonth(month, card.dueDay),
  };
}

export function invoiceSummary(
  data: FinanceData,
  cardId: string,
  month: string,
) {
  const invoice = invoiceFor(data, cardId, month);
  const items = expensesForMonth(data, month).filter(
    (e) => e.cardId === cardId,
  );
  const singles = items.filter((e) => e.kind !== "installment");
  const installments = items.filter((e) => e.kind === "installment");
  const sum = (values: Expense[]) =>
    values.reduce((total, e) => total + e.amountCents, 0);
  return {
    ...invoice,
    items,
    singles,
    installments,
    singleTotal: sum(singles),
    installmentTotal: sum(installments),
    total: sum(items),
  };
}

export function assertEditable(
  data: FinanceData,
  items: Pick<Expense, "cardId" | "date">[],
) {
  if (
    items.some(
      (e) => e.cardId && invoiceFor(data, e.cardId, e.date.slice(0, 7)).paid,
    )
  )
    throw new Error(
      "Desfaça a quitação da fatura antes de alterar seus gastos.",
    );
}

export function ensureInvoice(
  data: FinanceData,
  cardId: string,
  month: string,
): FinanceData {
  if (
    !data.cards.some((c) => c.id === cardId) ||
    !monthSchema.safeParse(month).success
  )
    throw new Error("Selecione um cartão e mês válidos.");
  if (data.invoices.some((i) => i.cardId === cardId && i.month === month))
    return data;
  return {
    ...data,
    invoices: [
      ...data.invoices,
      { id: crypto.randomUUID(), cardId, month, paid: false },
    ],
  };
}

export function setInvoicePaid(
  data: FinanceData,
  cardId: string,
  month: string,
  paid: boolean,
): FinanceData {
  const next = ensureInvoice(data, cardId, month);
  if (paid && !invoiceSummary(data, cardId, month).items.length)
    throw new Error("Adicione gastos antes de quitar a fatura.");
  return {
    ...next,
    invoices: next.invoices.map((i) =>
      i.cardId === cardId && i.month === month ? { ...i, paid } : i,
    ),
  };
}

export type NewExpense = ExpenseInput & {
  kind: Expense["kind"];
  totalInstallments?: number;
  firstInstallment?: number;
  endMonth?: string | null;
  dueDay?: number;
};
export function addExpense(data: FinanceData, input: NewExpense): FinanceData {
  const base = expenseSchema.parse({
    ...Object.fromEntries(
      Object.entries(input).filter(
        ([key]) =>
          ![
            "totalInstallments",
            "firstInstallment",
            "endMonth",
            "dueDay",
          ].includes(key),
      ),
    ),
    id: crypto.randomUUID(),
  });
  if (base.kind === "single" || base.kind === "debt") return saveExpense(data, base, base.id);
  const firstMonth = base.date.slice(0, 7);
  const seriesId = crypto.randomUUID();
  if (base.kind === "fixed") {
    const rule = recurrenceSchema.parse({
      id: seriesId,
      description: base.description,
      amountCents: base.amountCents,
      category: base.category,
      startMonth: firstMonth,
      endMonth: input.endMonth ?? null,
      day: input.dueDay ?? Number(base.date.slice(8)),
      cardId: base.cardId,
      skippedMonths: [],
    });
    if (rule.endMonth && rule.endMonth < firstMonth)
      throw new Error("O término deve ser igual ou posterior ao início.");
    assertFutureEditable(data, rule.cardId, firstMonth, rule.endMonth);
    return {
      ...data,
      recurrences: [...data.recurrences, rule],
      expenses: [
        ...data.expenses,
        { ...base, date: dateInMonth(firstMonth, rule.day), seriesId },
      ],
    };
  }
  const count = input.totalInstallments ?? 2;
  const first = input.firstInstallment ?? 1;
  const plan = installmentSchema.parse({
    id: seriesId,
    totalInstallments: count,
    firstInstallment: first,
    firstMonth,
  });
  if (first > count)
    throw new Error(
      "A parcela inicial não pode ultrapassar o total de parcelas.",
    );
  if (first === 1 && base.amountCents < count)
    throw new Error("O total deve permitir pelo menos um centavo por parcela.");
  const expenses = Array.from({ length: count - first + 1 }, (_, offset) => ({
    ...base,
    id: crypto.randomUUID(),
    seriesId,
    installmentNumber: first + offset,
    installmentCount: count,
    amountCents:
      first === 1
        ? Math.floor(base.amountCents / count) +
          (offset < base.amountCents % count ? 1 : 0)
        : base.amountCents,
    date: dateInMonth(
      shiftMonth(firstMonth, offset),
      input.dueDay ?? Number(base.date.slice(8)),
    ),
    status: offset === 0 ? base.status : ("planned" as const),
  }));
  assertEditable(data, expenses);
  return financeSchema.parse({
    ...data,
    installments: [...data.installments, plan],
    expenses: [...data.expenses, ...expenses],
  });
}

function assertFutureEditable(
  data: FinanceData,
  cardId: string | null,
  startMonth: string,
  endMonth: string | null,
) {
  if (
    cardId &&
    data.invoices.some(
      (i) =>
        i.cardId === cardId &&
        i.paid &&
        i.month >= startMonth &&
        (!endMonth || i.month <= endMonth),
    )
  )
    throw new Error(
      "Desfaça a quitação das faturas afetadas antes de alterar a série.",
    );
}

export function editOccurrence(
  data: FinanceData,
  expense: Expense,
  input: ExpenseInput,
  scope: "one" | "future",
): FinanceData {
  assertEditable(data, [expense]);
  if (!expense.seriesId || scope === "one") {
    if (expense.seriesId && input.date.slice(0, 7) !== expense.date.slice(0, 7))
      throw new Error("Uma ocorrência deve permanecer no mês original.");
    return saveExpense(data, { ...expense, ...input }, expense.id);
  }
  const month = expense.date.slice(0, 7);
  if (input.date.slice(0, 7) !== month)
    throw new Error("Mantenha o mês da ocorrência ao editar a série.");
  if (expense.kind === "installment") {
    const affected = data.expenses.filter(
      (e) => e.seriesId === expense.seriesId && e.date >= `${month}-01`,
    );
    assertEditable(data, affected);
    const changes = affected.map((e) =>
      expenseSchema.parse({
        ...e,
        description: input.description,
        category: input.category,
        amountCents: input.amountCents,
        date:
          input.date === expense.date
            ? e.date
            : dateInMonth(e.date.slice(0, 7), Number(input.date.slice(8))),
        status: e.id === expense.id ? input.status : e.status,
      }),
    );
    assertEditable(data, changes);
    return {
      ...data,
      expenses: data.expenses.map(
        (e) => changes.find((c) => c.id === e.id) ?? e,
      ),
    };
  }
  const rule = data.recurrences.find((r) => r.id === expense.seriesId)!;
  assertFutureEditable(data, rule.cardId, month, rule.endMonth);
  const affected = data.expenses.filter(
    (e) => e.seriesId === rule.id && e.date >= `${month}-01`,
  );
  if (affected.some((e) => !e.cardId && e.status === "paid"))
    throw new Error(
      "Edite individualmente as ocorrências já pagas antes de alterar as futuras.",
    );
  const id = crypto.randomUUID();
  const nextRule = {
    ...rule,
    id,
    startMonth: month,
    description: input.description,
    category: input.category,
    amountCents: input.amountCents,
    day: input.date === expense.date ? rule.day : Number(input.date.slice(8)),
    skippedMonths: rule.skippedMonths.filter((m) => m >= month),
  };
  const previousEnd = shiftMonth(month, -1);
  return {
    ...data,
    recurrences: [
      ...data.recurrences
        .filter((r) => r.id !== rule.id || r.startMonth < month)
        .map((r) => (r.id === rule.id ? { ...r, endMonth: previousEnd } : r)),
      nextRule,
    ],
    expenses: [
      ...data.expenses.filter(
        (e) => e.seriesId !== rule.id || e.date < `${month}-01`,
      ),
      expenseSchema.parse({
        ...expense,
        ...input,
        id: `rec:${id}:${month}`,
        seriesId: id,
      }),
    ],
  };
}

export function removeOccurrence(
  data: FinanceData,
  expense: Expense,
  scope: "one" | "future",
): FinanceData {
  const month = expense.date.slice(0, 7);
  assertEditable(data, [expense]);
  if (!expense.seriesId)
    return {
      ...data,
      expenses: data.expenses.filter((e) => e.id !== expense.id),
    };
  const affected = data.expenses.filter(
    (e) =>
      e.seriesId === expense.seriesId &&
      (scope === "one" ? e.id === expense.id : e.date >= `${month}-01`),
  );
  assertEditable(data, affected);
  if (expense.kind === "fixed") {
    const rule = data.recurrences.find((r) => r.id === expense.seriesId)!;
    if (scope === "future")
      assertFutureEditable(data, rule.cardId, month, rule.endMonth);
    if (
      scope === "future" &&
      affected.some((e) => !e.cardId && e.status === "paid")
    )
      throw new Error(
        "A série possui ocorrências pagas. Exclua-as individualmente antes de encerrar a série.",
      );
    return {
      ...data,
      expenses: data.expenses.filter(
        (e) => !affected.some((a) => a.id === e.id),
      ),
      recurrences: data.recurrences
        .filter(
          (r) => scope !== "future" || r.id !== rule.id || r.startMonth < month,
        )
        .map((r) =>
          r.id !== rule.id
            ? r
            : scope === "one"
              ? {
                  ...r,
                  skippedMonths: [...new Set([...r.skippedMonths, month])],
                }
              : { ...r, endMonth: shiftMonth(month, -1) },
        ),
    };
  }
  return {
    ...data,
    expenses: data.expenses.filter((e) => !affected.some((a) => a.id === e.id)),
  };
}

export function saveCategory(
  data: FinanceData,
  input: Omit<Category, "id" | "archived">,
  id = crypto.randomUUID(),
): FinanceData {
  const old = data.categories.find((c) => c.id === id);
  const category = categorySchema.parse({
    ...input,
    id,
    archived: old?.archived ?? false,
  });
  if (
    data.categories.some(
      (c) =>
        c.id !== id &&
        c.name.toLocaleLowerCase("pt-BR") ===
          category.name.toLocaleLowerCase("pt-BR"),
    )
  )
    throw new Error("Já existe uma categoria com esse nome.");
  return {
    ...data,
    categories: old
      ? data.categories.map((c) => (c.id === id ? category : c))
      : [...data.categories, category],
    expenses: data.expenses.map((e) =>
      e.category === old?.name ? { ...e, category: category.name } : e,
    ),
    recurrences: data.recurrences.map((r) =>
      r.category === old?.name ? { ...r, category: category.name } : r,
    ),
    debts: data.debts.map((d) => d.category === old?.name ? { ...d, category: category.name } : d),
  };
}

export function saveCard(
  data: FinanceData,
  input: Omit<CreditCard, "id">,
  id = crypto.randomUUID(),
): FinanceData {
  const card = cardSchema.parse({ ...input, id });
  const old = data.cards.find((c) => c.id === id);
  if (
    old &&
    (old.dueDay !== card.dueDay || old.closingDay !== card.closingDay) &&
    data.invoices.some((i) => i.cardId === id && i.paid)
  )
    throw new Error(
      "Desfaça as quitações deste cartão antes de alterar fechamento ou vencimento.",
    );
  return {
    ...data,
    cards: old
      ? data.cards.map((c) => (c.id === id ? card : c))
      : [...data.cards, card],
  };
}

export function installmentSummaries(data: FinanceData, month: string) {
  return data.installments.flatMap((plan) => {
    const items = data.expenses
      .filter((e) => e.seriesId === plan.id)
      .map((e) =>
        e.cardId
          ? {
              ...e,
              status: invoiceFor(data, e.cardId, e.date.slice(0, 7)).paid
                ? ("paid" as const)
                : ("planned" as const),
            }
          : e,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return [];
    const current = items.find((e) => e.date.slice(0, 7) === month);
    const pending = items.filter((e) => e.status === "planned");
    return [
      {
        ...plan,
        description: items[0].description,
        items,
        current,
        paidCount: items.filter((e) => e.status === "paid").length,
        pendingCount: pending.length,
        remaining: pending.reduce((sum, e) => sum + e.amountCents, 0),
        lastMonth: items.at(-1)!.date.slice(0, 7),
      },
    ];
  });
}

export function groupExpenses(expenses: Expense[], key: "category" | "kind") {
  const groups = new Map<string, number>();
  for (const item of expenses)
    groups.set(item[key], (groups.get(item[key]) ?? 0) + item.amountCents);
  return Array.from(groups, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value,
  );
}
