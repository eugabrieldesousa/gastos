import { describe, expect, it } from "vitest";
import { addExpense, emptyFinanceData, invoiceSummary, monthSummary, parseBackup, removeOccurrence, saveCard, saveExpense, setInvoicePaid, type ColumnMapping } from "../../src/lib/finance";
import { debtSummary, saveDebt } from "../../src/lib/debts";
import { applyImport, inspectImportRow, normalizeSheet, parseImportDate, parseOfx, parseSignedMoney, readImportFile, saveBankSource, suggestMapping, type ImportBatch, type ImportChoice, type ImportRow } from "../../src/lib/imports";
import { LocalFinanceRepository, STORAGE_KEY, StorageConflictError } from "../../src/lib/repository";

const hash = "a".repeat(64), secondHash = "b".repeat(64);
const mapping: ColumnMapping = { sheet: "CSV", headerRow: 0, date: 0, description: 1, amount: 2, direction: null,
  externalId: 3, debit: null, credit: null, expenseSign: "negative" };
const row: ImportRow = { row: 1, date: "2026-09-05", description: "Mercado", signedAmountCents: -10000, externalId: "t1",
  error: null, hint: "expense", installmentNumber: null, installmentCount: null };
const choice: ImportChoice = { row, action: "create", category: "Alimentação" };
function create() {
  return saveBankSource(emptyFinanceData(), { bank: "bb", name: "Conta principal", kind: "account", cardId: null, mapping: null });
}
function batch(data: ReturnType<typeof create>, fileHash = hash): ImportBatch { return { sourceId: data.bankSources[0].id, fileHash, invoiceMonth: "2026-09", mapping: null }; }
function cardData() {
  let data = saveCard(emptyFinanceData(), { name: "Itaú", closingDay: 25, dueDay: 5 });
  data = saveBankSource(data, { bank: "itau", name: "Cartão final 1234", kind: "card", cardId: data.cards[0].id, mapping: null });
  return data;
}
function bytes(value: string): ArrayBuffer { return new TextEncoder().encode(value).buffer; }

describe("leitura e normalização", () => {
  it.each([["-1.234,56", -123456], ["1234.56", 123456], ["1.234", 123400], ["(12,34)", -1234], ["12,34-", -1234], [0.1, 10]])("lê %s sem perder centavos", (value, cents) => expect(parseSignedMoney(value)).toBe(cents));
  it.each(["1e6", "NaN", "12,345", "1,234.56", "", "1000000001", 0.111])("rejeita valor ambíguo/inválido %s", (v) => expect(parseSignedMoney(v)).toBeNull());
  it("valida datas brasileiras, OFX e datas impossíveis", () => {
    expect(parseImportDate("05/09/2026")).toBe("2026-09-05");
    expect(parseImportDate("05-09-2026")).toBe("2026-09-05");
    expect(parseImportDate("20260905120000[-3:BRT]")).toBe("2026-09-05");
    expect(parseImportDate("31/02/2026")).toBeNull();
  });
  it.each([true, false])("lê OFX XML e SGML (XML=%s)", (xml) => {
    const end = (tag: string) => xml ? `</${tag}>` : "";
    const result = parseOfx(`<OFX><CURDEF>BRL${end("CURDEF")}<STMTTRN><DTPOSTED>20260905120000${end("DTPOSTED")}<TRNAMT>-1234.56${end("TRNAMT")}<FITID>abc${end("FITID")}<MEMO>Loja &amp; Cia${end("MEMO")}</STMTTRN></OFX>`);
    expect(result[0]).toMatchObject({ date: "2026-09-05", signedAmountCents: -123456, externalId: "abc", description: "Loja & Cia", error: null });
    expect(() => parseOfx("<CURDEF>USD<STMTTRN></STMTTRN>")).toThrow("BRL");
    expect(() => parseOfx("<BANKACCTFROM><BANKACCTFROM><STMTTRN></STMTTRN>")).toThrow("várias contas");
  });
  it("detecta cabeçalhos depois de títulos e mapeia débito/crédito", () => {
    const sheet = { name: "Dados", rows: [["Meu banco"], ["Data", "Histórico", "Débito", "Crédito", "Identificador"],
      ["05/09/2026", "Loja", "120,50", "", "abc"], ["06/09/2026", "Entrada", "", "200,00", "def"], ["07/09/2026", "Ambíguo", "10,00", "20,00", "xyz"]] };
    const guess = suggestMapping(sheet, "account");
    expect(guess).toMatchObject({ headerRow: 1, debit: 2, credit: 3, externalId: 4 });
    const rows = normalizeSheet(sheet, guess);
    expect(rows[0]).toMatchObject({ row: 2, signedAmountCents: -12050 });
    expect(rows[1]).toMatchObject({ signedAmountCents: 20000, hint: "credit" });
    expect(rows[2].error).toBeTruthy();
  });
  it("respeita sinal de cartão e indicador de direção", () => {
    const sheet = { name: "CSV", rows: [["Data", "Descrição", "Valor", "Tipo"], ["05/09/2026", "Compra", "10,00", "D"], ["05/09/2026", "Estorno", "5,00", "C"]] };
    const rows = normalizeSheet(sheet, { ...mapping, externalId: null, direction: 3, expenseSign: "positive" });
    expect(rows.map((r) => r.signedAmountCents)).toEqual([-1000, 500]);
  });
  it("lê CSV com separador, aspas e encoding do banco", async () => {
    const parsed = await readImportFile("extrato.csv", bytes('Data;Descrição;Valor\n05/09/2026;"Mercado; filial";-10,20'));
    expect(parsed.hash).toHaveLength(64);
    expect(normalizeSheet(parsed.sheets[0], { ...mapping, externalId: null })[0]).toMatchObject({ description: "Mercado; filial", signedAmountCents: -1020 });
    const encoded = new Uint8Array([68,97,116,97,59,68,101,115,99,114,105,231,227,111,59,86,97,108,111,114,10,48,53,47,48,57,47,50,48,50,54,59,80,227,111,59,45,49,48]);
    const legacy = await readImportFile("antigo.csv", encoded.buffer);
    expect(legacy.sheets[0].rows[1][1]).toBe("Pão");
    await expect(readImportFile("foto.pdf", bytes("pdf"))).rejects.toThrow("OFX");
    await expect(readImportFile("quebrado.csv", bytes('Data,Valor\n"data,10'))).rejects.toThrow("aspas");
  });
  it.each(["xlsx", "xls"] as const)("lê Excel %s com abas, datas e acentos", async (ext) => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Resumo"]]), "Resumo");
    const sheet = XLSX.utils.aoa_to_sheet([["Data", "Descrição", "Valor"], [new Date(2026, 8, 5), "Pão e café", -12.34]], { cellDates: false, dateNF: "dd/mm/yyyy" });
    XLSX.utils.book_append_sheet(workbook, sheet, "Movimentos");
    const parsed = await readImportFile(`extrato.${ext}`, XLSX.write(workbook, { type: "array", bookType: ext === "xls" ? "biff8" : "xlsx" }));
    expect(parsed.sheets.map((s) => s.name)).toEqual(["Resumo", "Movimentos"]);
    const rows = normalizeSheet(parsed.sheets[1], { ...mapping, sheet: "Movimentos", externalId: null });
    expect(rows[0]).toMatchObject({ date: "2026-09-05", description: "Pão e café", signedAmountCents: -1234 });
  });
});

describe("revisão, identidade e persistência", () => {
  it("importa saídas, guarda ignorados e o mapeamento em backup", () => {
    const initial = create();
    const data = applyImport(initial, { ...batch(initial), mapping }, [choice, { row: { ...row, row: 2, externalId: "entrada", signedAmountCents: 10000, hint: "credit" }, action: "ignore" }]);
    expect(monthSummary(data, "2026-09").paid).toBe(10000);
    expect(data.importRecords).toHaveLength(2);
    expect(data.bankSources[0].mapping).toEqual(mapping);
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it("mantém a identidade ao editar ou excluir o gasto e separa contas", () => {
    let data = create();
    data = applyImport(data, batch(data), [choice]);
    const source = data.bankSources[0];
    const id = data.expenses[0].id;
    data = saveExpense(data, { ...data.expenses[0], description: "Nome editado", amountCents: 9000 }, id);
    expect(inspectImportRow(data, source, row, secondHash, "2026-09").known?.expenseId).toBe(id);
    data = removeOccurrence(data, data.expenses[0], "one");
    expect(() => applyImport(data, batch(data, secondHash), [choice])).toThrow("já foi registrada");
    data = saveBankSource(data, { ...source, name: "Outra conta" });
    data = applyImport(data, { ...batch(data), sourceId: data.bankSources[1].id }, [choice]);
    expect(data.expenses).toHaveLength(1);
    expect(data.importRecords).toHaveLength(2);
  });
  it("reconhece arquivo renomeado sem ID e exige revisão em arquivo sobreposto", async () => {
    const payload = bytes("Data;Descrição;Valor\n05/09/2026;Mercado;-100,00");
    const first = await readImportFile("extrato.csv", payload), renamed = await readImportFile("outro-nome.csv", payload);
    expect(renamed.hash).toBe(first.hash);
    const noId = { ...row, externalId: null };
    let data = create();
    data = applyImport(data, batch(data, first.hash), [{ ...choice, row: noId }]);
    expect(inspectImportRow(data, data.bankSources[0], noId, renamed.hash, "2026-09").known).toBeTruthy();
    expect(inspectImportRow(data, data.bankSources[0], noId, secondHash, "2026-09").possibleDuplicate).toBe(true);
    expect(() => applyImport(data, batch(data, secondHash), [{ ...choice, row: noId }])).toThrow("duplicidade");
    data = applyImport(data, batch(data, secondHash), [{ ...choice, row: noId, confirmDuplicate: true }]);
    expect(data.expenses).toHaveLength(2);
  });
  it("preserva transações iguais com IDs distintos e detecta IDs repetidos", () => {
    let data = create();
    data = applyImport(data, batch(data), [choice, { ...choice, row: { ...row, row: 2, externalId: "t2" } }]);
    expect(data.expenses).toHaveLength(2);
    const empty = create();
    expect(() => applyImport(empty, batch(empty), [choice, { ...choice, row: { ...row, row: 2 } }])).toThrow("repete um identificador");
    expect(empty.expenses).toHaveLength(0);
  });
  it("distingue abas do mesmo arquivo e mantém a identidade ao trocar o mês da fatura", () => {
    let data = cardData();
    const noId = { ...row, externalId: null, sheet: "Aba 1" };
    data = applyImport(data, batch(data), [{ ...choice, row: noId }]);
    expect(inspectImportRow(data, data.bankSources[0], noId, hash, "2026-10").known).toBeTruthy();
    const secondSheet = { ...noId, sheet: "Aba 2", description: "Outra compra" };
    data = applyImport(data, batch(data), [{ ...choice, row: secondSheet }]);
    expect(data.expenses).toHaveLength(2);
    expect(data.importRecords).toHaveLength(2);
  });
  it("permite rever linha ignorada sem duplicar seu registro", () => {
    let data = create();
    data = applyImport(data, batch(data), [{ ...choice, action: "ignore" }]);
    data = applyImport(data, batch(data), [choice]);
    expect(data.importRecords).toHaveLength(1);
    expect(data.importRecords[0].action).toBe("create");
    expect(data.expenses).toHaveLength(1);
  });
  it("vincula um gasto manual e materializa uma ocorrência fixa sem duplicar", () => {
    let data = addExpense(create(), { description: "Mercado", amountCents: 10000, category: "Alimentação", date: row.date!, status: "planned", kind: "fixed" });
    const october = { ...row, date: "2026-10-05", externalId: "outubro" };
    const info = inspectImportRow(data, data.bankSources[0], october, hash, "2026-10");
    expect(info.matching[0].id).toMatch(/^rec:/);
    data = applyImport(data, batch(data), [{ row: october, action: "link", targetId: info.matching[0].id }]);
    expect(data.expenses).toHaveLength(2);
    expect(monthSummary(data, "2026-10")).toMatchObject({ paid: 10000, planned: 0 });
    expect(monthSummary(data, "2026-11").planned).toBe(10000);
  });
  it("vincula parcela gerada e bloqueia alteração de fatura quitada", () => {
    let data = cardData();
    const cardId = data.cards[0].id;
    data = applyImport(data, batch(data), [{ ...choice, installmentNumber: 1, installmentCount: 3 }]);
    expect(data.expenses.map((e) => e.amountCents)).toEqual([10000, 10000, 10000]);
    const second = { ...row, date: "2026-10-05", externalId: "parcela2", installmentNumber: 2, installmentCount: 3 };
    const target = data.expenses[1];
    data = applyImport(data, { ...batch(data), invoiceMonth: "2026-10" }, [{ row: second, action: "link", targetId: target.id }]);
    expect(data.expenses).toHaveLength(3);
    expect(data.expenses[1].purchaseDate).toBe("2026-10-05");
    data = setInvoicePaid(data, cardId, "2026-09", true);
    expect(() => applyImport(data, batch(data), [{ ...choice, row: { ...row, externalId: "nova" }, confirmDuplicate: true }])).toThrow("quitação");
  });
  it("quita fatura sem criar despesa e preserva tudo se o valor divergir", () => {
    let data = cardData();
    data = addExpense(data, { description: "Compra", amountCents: 10000, category: "Outros", date: "2026-09-05", status: "planned", kind: "single", cardId: data.cards[0].id });
    data = saveBankSource(data, { bank: "bb", name: "Conta", kind: "account", cardId: null, mapping: null });
    const accountBatch = { ...batch(data), sourceId: data.bankSources[1].id };
    const invoiceChoice: ImportChoice = { row: { ...row, hint: "invoice", description: "Pagamento fatura" }, action: "invoice", invoiceCardId: data.cards[0].id, invoiceMonth: "2026-09" };
    expect(() => applyImport(data, accountBatch, [{ ...invoiceChoice, row: { ...invoiceChoice.row, signedAmountCents: -9999 } }])).toThrow("divergente");
    const next = applyImport(data, accountBatch, [invoiceChoice]);
    expect(next.expenses).toHaveLength(1);
    expect(invoiceSummary(next, data.cards[0].id, "2026-09").paid).toBe(true);
    expect(data.invoices).toEqual([]);
    expect(() => applyImport(data, accountBatch, [{ ...choice, row: invoiceChoice.row }])).toThrow("fatura");
  });
  it("usa o gasto como único pagamento de dívida", () => {
    let data = saveDebt(create(), { name: "Carro", creditor: "Pai", category: "Carro", originalCents: 100000, downPaymentCents: 0, historicalPaidCents: 0, startMonth: "2026-09" });
    data = saveExpense(data, { description: "Pix pai", amountCents: 10000, category: "Carro", date: row.date!, status: "paid" });
    const id = data.expenses[0].id;
    data = applyImport(data, batch(data), [{ row: { ...row, description: "Pix pai" }, action: "debt", debtId: data.debts[0].id, targetId: id }]);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].category).toBe("Carro");
    expect(data.importRecords[0].expenseId).toBe(id);
    expect(debtSummary(data, data.debts[0], "2026-10-05").remaining).toBe(90000);
  });
  it("bloqueia entradas, transferências e lotes parcialmente inválidos", () => {
    const data = create();
    expect(() => applyImport(data, batch(data), [choice, { ...choice, row: { ...row, row: 2, externalId: "credit", signedAmountCents: 1, hint: "credit" } }])).toThrow("saídas");
    expect(() => applyImport(data, batch(data), [{ ...choice, row: { ...row, hint: "transfer" } }])).toThrow("Transferências");
    const next = applyImport(data, batch(data), [{ action: "ignore", row: { ...row, date: null, signedAmountCents: null, error: "Inválida" } }]);
    expect(next.importRecords).toHaveLength(1);
    expect(data.importRecords).toHaveLength(0);
    expect(data.expenses).toHaveLength(0);
  });
  it("sugere categoria confirmada e mantém origem imutável após importação", () => {
    let data = create();
    data = applyImport(data, batch(data), [choice]);
    const source = data.bankSources[0];
    expect(inspectImportRow(data, source, { ...row, externalId: "next", date: "2026-09-06" }, hash, "2026-09").category).toBe("Alimentação");
    expect(() => saveBankSource(data, { ...source, bank: "itau" }, source.id)).toThrow("mantém");
  });
  it("salva um único lote e preserva o documento em falhas e conflitos", async () => {
    const initial = create();
    const storage = new Map([[STORAGE_KEY, JSON.stringify(initial)]]);
    let writes = 0;
    const repository = new LocalFinanceRepository(() => ({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { writes++; storage.set(key, value); } }));
    const next = applyImport(initial, batch(initial), [choice]);
    await repository.write(next, 0);
    expect(writes).toBe(1);
    const snapshot = storage.get(STORAGE_KEY);
    await expect(repository.write(next, 0)).rejects.toBeInstanceOf(StorageConflictError);
    expect(storage.get(STORAGE_KEY)).toBe(snapshot);
    const failing = new LocalFinanceRepository(() => ({ getItem: (key) => storage.get(key) ?? null, setItem: () => { throw new Error("quota"); } }));
    await expect(failing.write({ ...next, revision: 1 }, 1)).rejects.toThrow("anteriores");
    expect(storage.get(STORAGE_KEY)).toBe(snapshot);
  });
});
