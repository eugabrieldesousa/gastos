import {
  addExpense, bankSourceSchema, columnMappingSchema, dateInMonth, editOccurrence,
  expensesForMonth, invoiceSummary, isValidDate, MAX_CENTS, saveExpense, setInvoicePaid,
  type BankSource, type ColumnMapping, type Expense, type FinanceData, type ImportRecord,
} from "./finance";
import { saveDebtPayment, validateFinance } from "./debts";

export const BANK_LABELS = { bb: "Banco do Brasil", "mercado-pago": "Mercado Pago", itau: "Itaú" } as const;
export type Cell = string | number | Date | null;
export type ImportSheet = { name: string; rows: Cell[][] };
export type ImportRow = {
  row: number; date: string | null; description: string; signedAmountCents: number | null;
  sheet?: string;
  externalId: string | null; error: string | null;
  hint: "expense" | "credit" | "transfer" | "invoice";
  installmentNumber: number | null; installmentCount: number | null;
};
export type ImportFile = { hash: string; sheets: ImportSheet[]; ofxRows: ImportRow[] | null };
export type ImportChoice = {
  row: ImportRow; action: ImportRecord["action"] | "skip";
  targetId?: string; category?: string; confirmDuplicate?: boolean;
  invoiceCardId?: string; invoiceMonth?: string;
  debtId?: string;
  installmentNumber?: number; installmentCount?: number;
};
export type ImportBatch = { sourceId: string; fileHash: string; invoiceMonth: string; mapping: ColumnMapping | null };

export function normalizeDescription(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseImportDate(value: Cell): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  const br = raw.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})(?:$|\s)/);
  const ofx = raw.match(/^(\d{4})(\d{2})(\d{2})(?:$|\d|\[)/);
  const date = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : ofx ? `${ofx[1]}-${ofx[2]}-${ofx[3]}` : "";
  return isValidDate(date) ? date : null;
}

export function parseSignedMoney(value: Cell): number | null {
  if (typeof value === "number") {
    const rounded = Math.round(value * 100);
    return Number.isSafeInteger(rounded) && Math.abs(rounded) <= MAX_CENTS && Math.abs(value * 100 - rounded) < 0.0001 ? rounded : null;
  }
  let raw = String(value ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  let sign = 1;
  if (/^\(.*\)$/.test(raw)) { sign = -1; raw = raw.slice(1, -1); }
  if (/^[-+]/.test(raw)) { sign = raw.startsWith("-") ? -1 : sign; raw = raw.slice(1); }
  if (/-$/.test(raw)) { sign = -1; raw = raw.slice(0, -1); }
  let decimal: string;
  if (raw.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(raw)) return null;
    decimal = raw.replaceAll(".", "").replace(",", ".");
  } else {
    if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) decimal = raw.replaceAll(".", "");
    else {
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
      decimal = raw;
    }
  }
  const [whole, fraction = ""] = decimal.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? sign * cents : null;
}

function rowHints(description: string, amount: number | null) {
  const normalized = normalizeDescription(description);
  const hint: ImportRow["hint"] = amount !== null && amount >= 0 ? "credit"
    : /pag(?:amento)? .*?(?:fatura|cartao)|pag(?:amento)? (?:fat|fatura)|debito automatico.*fatura/.test(normalized) ? "invoice"
      : /mesma titularidade|entre (?:minhas )?contas|transferencia propria/.test(normalized) ? "transfer" : "expense";
  const parts = description.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,3})\s*\/\s*(\d{1,3})(?:\D|$)/i);
  const n = parts ? Number(parts[1]) : 0, count = parts ? Number(parts[2]) : 0;
  return { hint, installmentNumber: n >= 1 && n <= count && count >= 2 && count <= 360 ? n : null,
    installmentCount: n >= 1 && n <= count && count >= 2 && count <= 360 ? count : null };
}

export function parseOfx(text: string): ImportRow[] {
  const currency = text.match(/<CURDEF>\s*([^<\s]+)/i)?.[1];
  if (currency && currency.toUpperCase() !== "BRL") throw new Error("Somente extratos em reais (BRL) são aceitos.");
  // Multiple account blocks cannot safely share one selected source / FITID namespace.
  if ((text.match(/<(?:BANKACCTFROM|CCACCTFROM)>/gi) ?? []).length > 1)
    throw new Error("Este OFX contém várias contas. Exporte cada conta separadamente.");
  const decode = (v: string) => v.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
  const blocks = Array.from(text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi));
  if (!blocks.length) throw new Error("O OFX não contém movimentações de conta ou cartão reconhecidas.");
  if (blocks.length > 100000) throw new Error("O extrato deve ter no máximo 100 mil linhas.");
  return blocks.map((match, row) => {
    const tag = (name: string) => decode(match[1].match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "");
    const date = parseImportDate(tag("DTPOSTED"));
    const signedAmountCents = parseSignedMoney(tag("TRNAMT"));
    const description = [tag("NAME"), tag("MEMO")].filter(Boolean).join(" · ").slice(0, 120) || "Movimentação sem descrição";
    const externalId = tag("FITID") || null;
    const error = !date ? "Data inválida." : signedAmountCents === null || signedAmountCents === 0 ? "Valor inválido ou zero." : externalId && externalId.length > 255 ? "Identificador muito longo." : null;
    return { row, date, description, signedAmountCents, externalId: externalId?.slice(0, 255) ?? null, error, ...rowHints(description, signedAmountCents) };
  });
}

function decodeText(bytes: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export async function readImportFile(name: string, bytes: ArrayBuffer): Promise<ImportFile> {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("O extrato deve ter no máximo 20 MB.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const ext = name.split(".").at(-1)?.toLowerCase();
  if (ext === "ofx") return { hash, sheets: [], ofxRows: parseOfx(decodeText(bytes)) };
  if (ext === "csv") {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<string[]>(decodeText(bytes), { skipEmptyLines: "greedy" });
    if (parsed.errors.some((e) => e.type === "Quotes")) throw new Error("O CSV contém aspas incompletas. Exporte o arquivo novamente.");
    if (parsed.data.length > 100000) throw new Error("O extrato deve ter no máximo 100 mil linhas.");
    return { hash, sheets: [{ name: "CSV", rows: parsed.data }], ofxRows: null };
  }
  if (ext !== "xls" && ext !== "xlsx") throw new Error("Selecione um arquivo OFX, CSV, XLS ou XLSX.");
  const XLSX = await import("xlsx");
  if (ext === "xls") XLSX.set_cptable(await import("xlsx/dist/cpexcel.full.mjs"));
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (range.e.r > 100000 || range.e.c > 1000) throw new Error("A planilha deve ter até 100 mil linhas e mil colunas.");
    }
    // Only cells formatted as dates become dates. Other numeric cells remain money/IDs.
    for (const key of Object.keys(sheet)) {
      const cell = sheet[key];
      if (!key.startsWith("!") && cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(cell.v, { date1904: workbook.Workbook?.WBProps?.date1904 });
        if (date) {
          cell.t = "s"; cell.v = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
          delete cell.z; delete cell.w;
        }
      }
    }
    return { name: sheetName, rows: XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true, blankrows: true }) };
  });
  if (!sheets.length) throw new Error("A planilha não contém abas.");
  return { hash, sheets, ofxRows: null };
}

export function suggestMapping(sheet: ImportSheet, kind: BankSource["kind"]): ColumnMapping {
  const find = (row: Cell[], pattern: RegExp) => {
    const index = row.findIndex((v) => pattern.test(normalizeDescription(String(v ?? ""))));
    return index < 0 ? null : index;
  };
  const headerRow = Math.max(0, sheet.rows.slice(0, 50).findIndex((row) => find(row, /^(data|date|data (?:da|de) (?:compra|transacao|lancamento)|transaction date)$/) !== null && find(row, /descricao|historico|description|lancamento|estabelecimento/) !== null));
  const row = sheet.rows[headerRow] ?? [];
  return { sheet: sheet.name, headerRow, date: find(row, /^data|^date|transaction date/) ?? 0,
    description: find(row, /descricao|historico|description|lancamento|estabelecimento/) ?? 1,
    amount: find(row, /^(valor|amount|valor (?:da |de )?(?:transacao|compra|lancamento)|transaction amount|valor liquido)$/),
    debit: find(row, /^debito$|^debit$|^saidas?$/), credit: find(row, /^credito$|^credit$|^entradas?$/),
    direction: find(row, /^(tipo|natureza|debito credito|d c|type)$/), externalId: find(row, /^(id|identificador|codigo|fitid|transaction id|id da transacao|numero de operacao|reference id)$/),
    expenseSign: kind === "card" ? "positive" : "negative" };
}

export function normalizeSheet(sheet: ImportSheet, input: ColumnMapping): ImportRow[] {
  const mapping = columnMappingSchema.parse(input);
  if (mapping.headerRow >= sheet.rows.length) throw new Error("A linha de cabeçalho não existe nesta aba.");
  if (mapping.amount === null && mapping.debit === null && mapping.credit === null)
    throw new Error("Selecione a coluna de valor ou as colunas de débito/crédito.");
  return sheet.rows.slice(mapping.headerRow + 1).flatMap((cells, offset) => {
    if (cells.every((c) => c === null || String(c).trim() === "")) return [];
    const get = (column: number | null) => column === null ? null : cells[column] ?? null;
    const description = String(get(mapping.description) ?? "").trim().slice(0, 120) || "Movimentação sem descrição";
    const date = parseImportDate(get(mapping.date));
    let amount = parseSignedMoney(get(mapping.amount));
    let amountError = false;
    if (mapping.debit !== null || mapping.credit !== null) {
      const debitCell = get(mapping.debit), creditCell = get(mapping.credit);
      const debit = debitCell === null || String(debitCell).trim() === "" ? 0 : parseSignedMoney(debitCell);
      const credit = creditCell === null || String(creditCell).trim() === "" ? 0 : parseSignedMoney(creditCell);
      amountError = debit === null || credit === null || (debit !== 0 && credit !== 0);
      amount = amountError ? null : Math.abs(credit!) - Math.abs(debit!);
    } else {
      if (amount !== null && mapping.expenseSign === "positive") amount = -amount;
      const direction = normalizeDescription(String(get(mapping.direction) ?? ""));
      if (amount !== null && /^(d|debito|debit|saida)$/.test(direction)) amount = -Math.abs(amount);
      else if (amount !== null && /^(c|credito|credit|entrada)$/.test(direction)) amount = Math.abs(amount);
      else if (direction) amountError = true;
    }
    const id = String(get(mapping.externalId) ?? "").trim();
    const error = !date ? "Data inválida; confira o mapeamento ou ignore a linha." : amountError || amount === null || amount === 0 ? "Valor ou débito/crédito inválido; confira as colunas." : id.length > 255 ? "Identificador muito longo." : null;
    return [{ row: mapping.headerRow + 1 + offset, sheet: sheet.name, date, description, signedAmountCents: amount, externalId: id.slice(0, 255) || null, error, ...rowHints(description, amount) }];
  });
}

export function saveBankSource(data: FinanceData, input: Omit<BankSource, "id">, id = crypto.randomUUID()) {
  const source = bankSourceSchema.parse({ ...input, id });
  const existing = data.bankSources.find((s) => s.id === id);
  if (existing && data.importRecords.some((r) => r.sourceId === id) && (existing.bank !== source.bank || existing.kind !== source.kind || existing.cardId !== source.cardId))
    throw new Error("Uma origem com importações mantém seu banco e conta/cartão. Crie outra origem para uma conta diferente.");
  return validateFinance({ ...data, bankSources: existing ? data.bankSources.map((s) => s.id === id ? source : s) : [...data.bankSources, source] });
}

export function importKey(row: ImportRow, hash: string) {
  return row.externalId ? `id:${row.externalId}` : `file:${hash}:${encodeURIComponent(row.sheet ?? "")}:${row.row}`;
}

function candidatesFor(data: FinanceData, source: BankSource, row: ImportRow, invoiceMonth: string): Expense[] {
  if (!row.date || row.signedAmountCents === null) return [];
  const month = source.kind === "card" ? invoiceMonth : row.date.slice(0, 7);
  const foreignExpenses = new Set(data.importRecords.filter((r) => r.action !== "ignore" && r.sourceId !== source.id).map((r) => r.expenseId));
  return expensesForMonth(data, month).filter((e) => (source.kind === "card" ? e.cardId === source.cardId : !e.cardId) &&
    !foreignExpenses.has(e.id));
}

export function inspectImportRow(data: FinanceData, source: BankSource, row: ImportRow, hash: string, invoiceMonth: string) {
  const key = importKey(row, hash);
  const known = data.importRecords.find((r) => r.sourceId === source.id && r.key === key);
  const candidates = candidatesFor(data, source, row, invoiceMonth);
  const description = normalizeDescription(row.description);
  const externalByExpense = new Map(data.importRecords.filter((r) => r.sourceId === source.id && r.action !== "ignore" && r.expenseId).map((r) => [r.expenseId, r.externalId]));
  const matching = candidates.filter((e) => e.amountCents === Math.abs(row.signedAmountCents ?? 0) &&
    (source.kind === "card" ? (e.purchaseDate === row.date || e.installmentNumber !== null) : e.date === row.date) &&
    normalizeDescription(e.description) === description &&
    !(row.externalId && externalByExpense.get(e.id) && externalByExpense.get(e.id) !== row.externalId));
  const overlapping = data.importRecords.some((r) => r.sourceId === source.id && r.key !== key && r.date === row.date &&
    r.signedAmountCents === row.signedAmountCents && normalizeDescription(r.description) === description && (!row.externalId || !r.externalId));
  const suggestionRecord = [...data.importRecords].reverse().find((r) => r.sourceId === source.id && r.action !== "ignore" && normalizeDescription(r.description) === description && r.expenseId);
  const suggestedCategory = data.expenses.find((e) => e.id === suggestionRecord?.expenseId)?.category;
  const category = data.categories.some((c) => c.name === suggestedCategory && !c.archived) ? suggestedCategory!
    : data.categories.find((c) => !c.archived && c.name === "Outros")?.name ?? data.categories.find((c) => !c.archived)?.name ?? data.categories[0].name;
  return { key, known, candidates, matching, possibleDuplicate: overlapping || matching.length > 0, category };
}

/** Pure batch operation. The hook commits its result only once after every row is valid. */
export function applyImport(data: FinanceData, batch: ImportBatch, choices: ImportChoice[]): FinanceData {
  const source = data.bankSources.find((s) => s.id === batch.sourceId);
  if (!source) throw new Error("A origem não existe mais. Revise a importação.");
  if (source.kind === "card" && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(batch.invoiceMonth))
    throw new Error("Confirme o mês de vencimento da fatura.");
  let next = data;
  const touched = new Set<string>();
  const invoices: Array<{ cardId: string; month: string; amount: number }> = [];
  for (const choice of choices) {
    if (choice.action === "skip") continue;
    const row = choice.row;
    const info = inspectImportRow(next, source, row, batch.fileHash, batch.invoiceMonth);
    if (touched.has(info.key)) throw new Error("O arquivo repete um identificador. Escolha uma ocorrência e deixe a outra sem alterar.");
    touched.add(info.key);
    if (info.known && info.known.action !== "ignore") throw new Error("Esta transação já foi registrada. Deixe-a sem alterar.");
    if (choice.action !== "ignore") {
      if (row.error || !row.date || row.signedAmountCents === null || row.signedAmountCents >= 0)
        throw new Error("Somente saídas válidas podem ser cadastradas; ignore entradas e linhas inválidas.");
      if (row.hint === "transfer") throw new Error("Transferências próprias não são despesas. Ignore esta linha.");
      if (row.hint === "invoice" && choice.action !== "invoice") throw new Error("Vincule o pagamento à fatura ou ignore-o para não duplicar os gastos.");
      if ((choice.action === "create" || (choice.action === "debt" && !choice.targetId)) && info.possibleDuplicate && !choice.confirmDuplicate)
        throw new Error("Confirme que a possível duplicidade é uma nova transação ou vincule um gasto existente.");
    }
    let expenseId: string | null = null;
    let invoiceCardId: string | null = null;
    let invoiceMonth: string | null = null;
    const card = source.kind === "card" ? next.cards.find((c) => c.id === source.cardId)! : null;
    const date = card ? dateInMonth(batch.invoiceMonth, card.dueDay) : row.date!;
    const input = { description: row.description, amountCents: Math.abs(row.signedAmountCents ?? 0), category: choice.category ?? info.category,
      date, status: card ? "planned" as const : "paid" as const, cardId: card?.id ?? null, purchaseDate: card ? row.date : null };
    if (choice.action === "create") {
      if (choice.installmentCount || choice.installmentNumber) {
        const count = choice.installmentCount ?? 0, first = choice.installmentNumber ?? 0;
        if (!Number.isInteger(count) || !Number.isInteger(first) || first < 1 || count < 2 || first > count || count > 360)
          throw new Error("Confirme número e total de parcelas válidos.");
        // The statement row contains the installment amount, even for installment one.
        const amountCents = first === 1 ? input.amountCents * count : input.amountCents;
        const before = new Set(next.expenses.map((e) => e.id));
        next = addExpense(next, { ...input, amountCents, kind: "installment", firstInstallment: first, totalInstallments: count, dueDay: Number(date.slice(8)) });
        expenseId = next.expenses.find((e) => !before.has(e.id) && e.date === date)!.id;
      } else {
        expenseId = crypto.randomUUID();
        next = saveExpense(next, { ...input, kind: "single" }, expenseId);
      }
    } else if (choice.action === "link") {
      const existing = info.candidates.find((e) => e.id === choice.targetId);
      if (!existing) throw new Error("Selecione um gasto do mesmo mês e conta/cartão.");
      const alreadyLinked = next.importRecords.some((r) => r.expenseId === existing.id && r.action !== "ignore" && !(r.sourceId === source.id && r.key === info.key));
      if (alreadyLinked) throw new Error("Este gasto já foi vinculado a outra transação. Revise a possível duplicidade.");
      if (existing.debtId) {
        next = saveDebtPayment(next, existing.debtId, { ...input, category: choice.category ?? existing.category, date: row.date! }, existing.id);
      } else {
        next = editOccurrence(next, existing, { description: existing.description, amountCents: input.amountCents,
          category: choice.category ?? existing.category, date,
          status: input.status, purchaseDate: input.purchaseDate }, "one");
      }
      expenseId = existing.id;
    } else if (choice.action === "debt") {
      if (card) throw new Error("Pagamentos de dívida precisam vir da conta, fora do cartão.");
      const debtId = choice.debtId;
      if (!debtId) throw new Error("Selecione a dívida deste pagamento.");
      if (choice.targetId && next.importRecords.some((r) => r.expenseId === choice.targetId && r.action !== "ignore"))
        throw new Error("Este gasto já tem outra transação vinculada.");
      next = saveDebtPayment(next, debtId, { ...input, category: next.debts.find((d) => d.id === debtId)?.category ?? input.category }, choice.targetId);
      expenseId = choice.targetId ?? next.expenses.at(-1)!.id;
    } else if (choice.action === "invoice") {
      if (card) throw new Error("Vincule pagamentos de fatura pelo extrato da conta.");
      invoiceCardId = choice.invoiceCardId ?? null;
      invoiceMonth = choice.invoiceMonth ?? null;
      if (!invoiceCardId || !next.cards.some((c) => c.id === invoiceCardId) || !invoiceMonth || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(invoiceMonth))
        throw new Error("Selecione o cartão e o mês da fatura paga.");
      invoices.push({ cardId: invoiceCardId, month: invoiceMonth, amount: input.amountCents });
    }
    const record: ImportRecord = { id: info.known?.id ?? crypto.randomUUID(), sourceId: source.id, key: info.key,
      fileHash: batch.fileHash, row: row.row, date: row.date, description: row.description,
      signedAmountCents: row.signedAmountCents, externalId: row.externalId, action: choice.action,
      expenseId, cardId: invoiceCardId, invoiceMonth };
    next = { ...next, importRecords: [...next.importRecords.filter((r) => r.id !== record.id), record] };
  }
  const invoiceKeys = new Set<string>();
  for (const payment of invoices) {
    const key = `${payment.cardId}:${payment.month}`;
    const summary = invoiceSummary(next, payment.cardId, payment.month);
    if (invoiceKeys.has(key) || summary.paid || !summary.items.length || summary.total !== payment.amount)
      throw new Error("Pagamento divergente ou fatura já quitada. Deixe esta linha sem alterar e confira a fatura antes de vincular.");
    invoiceKeys.add(key);
    next = setInvoicePaid(next, payment.cardId, payment.month, true);
  }
  if (batch.mapping) next = { ...next, bankSources: next.bankSources.map((s) => s.id === source.id ? { ...s, mapping: batch.mapping } : s) };
  return validateFinance(next);
}
