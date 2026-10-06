"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Pencil, Upload, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BankImportGuide } from "./bank-import-guide";
import { EditorModal, Field, NativeSelect, type ModalProps } from "./finance-editor";
import type { FinanceSectionProps } from "./debts-panel";
import { formatMoney, type BankSource, type ColumnMapping, type FinanceData } from "@/lib/finance";
import { BANK_LABELS, applyImport, inspectImportRow, normalizeDescription, normalizeSheet, readImportFile, saveBankSource, suggestMapping, type ImportBatch, type ImportChoice, type ImportFile, type ImportRow, type ImportSheet } from "@/lib/imports";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível ler o extrato.";
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function SourceEditor({ data, source, onSave, ...modal }: ModalProps & {
  data: FinanceData; source: BankSource | null;
  onSave: (input: Omit<BankSource, "id">, id?: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<BankSource["kind"]>(source?.kind ?? "account");
  const [error, setError] = useState<string | null>(null);
  const locked = Boolean(source && data.importRecords.some((r) => r.sourceId === source.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const input: Omit<BankSource, "id"> = { bank: locked ? source!.bank : text(form, "bank") as BankSource["bank"],
        name: text(form, "name"), kind, cardId: kind === "card" ? locked ? source!.cardId : text(form, "cardId") || null : null,
        mapping: source?.mapping ?? null };
      if (await onSave(input, source?.id)) modal.onClose(); else setError("save");
    } catch (cause) { setError(message(cause)); }
  }
  return <EditorModal {...modal} title={source ? "Editar origem" : "Nova origem bancária"}
    description="Identifique cada conta e cartão separadamente. Use sempre a mesma origem ao importar seus extratos."
    onSubmit={submit} submitLabel="Salvar origem" error={error}>
    <Field label="Banco" id="source-bank"><NativeSelect id="source-bank" name="bank" defaultValue={source?.bank ?? "bb"} disabled={locked}>{Object.entries(BANK_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</NativeSelect></Field>
    <Field label="Identificação da conta ou cartão" id="source-name"><Input id="source-name" name="name" defaultValue={source?.name} placeholder="Ex.: Conta principal · final 1234" maxLength={60} required /></Field>
    <Field label="Tipo da origem" id="source-kind"><NativeSelect id="source-kind" value={kind} disabled={locked} onChange={(e) => setKind(e.target.value as BankSource["kind"])}><option value="account">Conta bancária</option><option value="card">Fatura de cartão</option></NativeSelect></Field>
    {kind === "card" ? <Field label="Cartão cadastrado" id="source-card" hint="Cadastre o cartão na seção Cartões e faturas, com fechamento e vencimento."><NativeSelect id="source-card" name="cardId" defaultValue={source?.cardId ?? ""} disabled={locked} required><option value="">Selecione o cartão</option>{data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field> : null}
    {locked ? <p className="field-hint">Esta origem já tem importações. Para outro banco ou conta/cartão, crie uma origem diferente.</p> : null}
  </EditorModal>;
}

const columns = [
  ["date", "Data", true], ["description", "Descrição", true], ["amount", "Valor", false],
  ["debit", "Débito / saídas", false], ["credit", "Crédito / entradas", false],
  ["direction", "Indicador débito/crédito", false], ["externalId", "Identificador da transação", false],
] as const;

function MappingEditor({ sheets, mapping, onChange, disabled }: {
  sheets: ImportSheet[]; mapping: ColumnMapping; onChange: (value: ColumnMapping) => void; disabled: boolean;
}) {
  const sheet = sheets.find((s) => s.name === mapping.sheet) ?? sheets[0];
  const headers = sheet.rows[mapping.headerRow] ?? [];
  const maxColumns = Math.max(headers.length, ...sheet.rows.slice(mapping.headerRow + 1, mapping.headerRow + 6).map((r) => r.length));
  return <div className="mapping-editor">
    <h3>Confira as colunas do arquivo</h3>
    <div className="import-setup-grid">
      <Field label="Aba da planilha" id="import-sheet"><NativeSelect id="import-sheet" value={mapping.sheet} disabled={disabled} onChange={(e) => onChange({ ...mapping, sheet: e.target.value, headerRow: 0 })}>{sheets.map((s) => <option key={s.name}>{s.name}</option>)}</NativeSelect></Field>
      <Field label="Linha do cabeçalho" id="import-header"><Input id="import-header" type="number" min={1} max={sheet.rows.length} value={mapping.headerRow + 1} disabled={disabled} onChange={(e) => onChange({ ...mapping, headerRow: Math.max(0, Number(e.target.value) - 1) })} /></Field>
      {columns.map(([key, label, required]) => <Field label={label} id={`map-${key}`} key={key}><NativeSelect id={`map-${key}`} value={mapping[key] ?? ""} disabled={disabled} onChange={(e) => onChange({ ...mapping, [key]: e.target.value === "" ? null : Number(e.target.value) })}>
        {!required ? <option value="">Não há coluna</option> : null}
        {Array.from({ length: Math.min(maxColumns, 1001) }, (_, index) => <option key={index} value={index}>{index + 1} · {String(headers[index] ?? "Sem título")}</option>)}
      </NativeSelect></Field>)}
      <Field label="Sinal dos gastos na coluna Valor" id="import-sign"><NativeSelect id="import-sign" value={mapping.expenseSign} disabled={disabled} onChange={(e) => onChange({ ...mapping, expenseSign: e.target.value as ColumnMapping["expenseSign"] })}><option value="negative">Valores negativos são gastos</option><option value="positive">Valores positivos são gastos</option></NativeSelect></Field>
    </div>
    <p className="field-hint">Colunas de débito/crédito têm prioridade sobre Valor. O indicador deve usar D/C, Débito/Crédito ou Saída/Entrada.</p>
    <details><summary>Primeiras linhas do arquivo</summary><div className="import-raw-preview"><table><tbody>{sheet.rows.slice(0, Math.max(5, Math.min(mapping.headerRow + 4, 20))).map((row, i) => <tr key={i}><th>{i + 1}</th>{row.map((cell, j) => <td key={j}>{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

function ReviewRow({ data, source, choice, fileHash, invoiceMonth, duplicateInFile, onChange, disabled }: {
  data: FinanceData; source: BankSource; choice: ImportChoice; fileHash: string; invoiceMonth: string;
  duplicateInFile: boolean; onChange: (choice: ImportChoice) => void; disabled: boolean;
}) {
  const row = choice.row;
  const info = inspectImportRow(data, source, row, fileHash, invoiceMonth);
  const handled = Boolean(info.known && info.known.action !== "ignore");
  const requiresConfirmation = info.possibleDuplicate || (duplicateInFile && !row.externalId);
  const outgoing = !row.error && row.signedAmountCents !== null && row.signedAmountCents < 0;
  const candidates = choice.action === "debt" ? info.candidates.filter((e) => !e.seriesId && (!e.debtId || e.debtId === choice.debtId)) : info.candidates;
  const label = row.error ?? (handled ? "Já registrada; a identidade foi preservada." : info.known?.action === "ignore" ? "Ignorada anteriormente; você pode rever a decisão."
    : duplicateInFile && row.externalId ? "O identificador se repete neste arquivo. Escolha uma ocorrência e deixe as outras sem alterar."
      : requiresConfirmation ? "Possível duplicidade: vincule um gasto ou confirme que é outra transação."
      : row.hint === "invoice" ? "Pagamento de fatura: vincule à fatura para não duplicar despesas."
        : row.hint === "transfer" ? "Transferência própria: não entra nos gastos." : row.hint === "credit" ? "Entrada ou estorno: não entra nos gastos nesta versão."
          : row.installmentNumber ? `Parece uma parcela ${row.installmentNumber}/${row.installmentCount}; confirme como cadastrar.` : "Nova movimentação.");
  const set = (patch: Partial<ImportChoice>) => onChange({ ...choice, ...patch });
  return <article className={`import-review-row ${row.error || info.possibleDuplicate || duplicateInFile ? "needs-review" : ""}`} data-testid="import-row">
    <div className="import-row-heading"><div><strong>{row.description}</strong><small>Linha {row.row + 1} · {row.date ?? "Data inválida"}{row.externalId ? ` · ID ${row.externalId}` : ""}</small></div><strong>{row.signedAmountCents === null ? "Valor inválido" : formatMoney(row.signedAmountCents)}</strong></div>
    <p className="field-hint">{label}</p>
    <div className="import-row-controls">
      <Field label="Ação" id={`row-action-${row.row}`}><NativeSelect id={`row-action-${row.row}`} value={choice.action} disabled={disabled || handled} onChange={(e) => set({ action: e.target.value as ImportChoice["action"], targetId: e.target.value === "link" ? info.matching[0]?.id : undefined, category: e.target.value === "link" ? info.matching[0]?.category ?? choice.category : choice.category, confirmDuplicate: false, installmentNumber: undefined, installmentCount: undefined })}>
        <option value="skip">Deixar sem alterar</option>
        {!handled ? <option value="ignore">Ignorar movimentação</option> : null}
        {!handled && outgoing && row.hint === "expense" ? <><option value="create">Criar gasto</option><option value="link">Vincular a gasto existente</option>{source.kind === "account" ? <option value="debt">Registrar pagamento de dívida</option> : null}</> : null}
        {!handled && outgoing && source.kind === "account" && row.hint !== "transfer" ? <option value="invoice">Vincular a pagamento de fatura</option> : null}
      </NativeSelect></Field>
      {choice.action === "create" || choice.action === "link" ? <Field label="Categoria" id={`row-category-${row.row}`}><NativeSelect id={`row-category-${row.row}`} value={choice.category ?? info.category} disabled={disabled} onChange={(e) => set({ category: e.target.value })}>{data.categories.filter((c) => !c.archived || c.name === choice.category).map((c) => <option key={c.id}>{c.name}</option>)}</NativeSelect></Field> : null}
      {choice.action === "debt" ? <Field label="Dívida" id={`row-debt-${row.row}`}><NativeSelect id={`row-debt-${row.row}`} value={choice.debtId ?? ""} disabled={disabled} onChange={(e) => set({ debtId: e.target.value, targetId: undefined })}><option value="">Selecione a dívida</option>{data.debts.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.creditor}</option>)}</NativeSelect></Field> : null}
      {choice.action === "link" || choice.action === "debt" ? <Field label="Gasto existente" id={`row-target-${row.row}`}><NativeSelect id={`row-target-${row.row}`} value={choice.targetId ?? ""} disabled={disabled} onChange={(e) => {
        const existing = candidates.find((c) => c.id === e.target.value);
        set({ targetId: e.target.value || undefined, category: existing?.category ?? choice.category });
      }}><option value="">{choice.action === "debt" ? "Criar novo pagamento" : "Selecione o gasto"}</option>{candidates.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.description} · {formatMoney(e.amountCents)}{e.installmentNumber ? ` · Parcela ${e.installmentNumber}/${e.installmentCount}` : ""}</option>)}</NativeSelect></Field> : null}
      {choice.action === "invoice" ? <>
        <Field label="Cartão da fatura paga" id={`row-invoice-card-${row.row}`}><NativeSelect id={`row-invoice-card-${row.row}`} value={choice.invoiceCardId ?? ""} disabled={disabled} onChange={(e) => set({ invoiceCardId: e.target.value })}><option value="">Selecione o cartão</option>{data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
        <Field label="Mês da fatura paga" id={`row-invoice-month-${row.row}`}><Input id={`row-invoice-month-${row.row}`} type="month" min="1000-01" max="9999-12" value={choice.invoiceMonth ?? ""} disabled={disabled} onChange={(e) => set({ invoiceMonth: e.target.value })} /></Field>
      </> : null}
    </div>
    {choice.action === "create" ? <div className="import-installment-controls">
      <label className="feature-checkbox"><input type="checkbox" checked={Boolean(choice.installmentCount)} disabled={disabled} onChange={(e) => set({ installmentNumber: e.target.checked ? row.installmentNumber ?? 1 : undefined, installmentCount: e.target.checked ? row.installmentCount ?? 2 : undefined })} />Criar parcelamento com este valor por parcela</label>
      {choice.installmentCount ? <div className="import-row-controls"><Field label="Número desta parcela" id={`row-installment-${row.row}`}><Input id={`row-installment-${row.row}`} type="number" min={1} max={360} value={choice.installmentNumber ?? 1} disabled={disabled} onChange={(e) => set({ installmentNumber: Number(e.target.value) })} /></Field><Field label="Quantidade total de parcelas" id={`row-count-${row.row}`}><Input id={`row-count-${row.row}`} type="number" min={2} max={360} value={choice.installmentCount} disabled={disabled} onChange={(e) => set({ installmentCount: Number(e.target.value) })} /></Field></div> : null}
    </div> : null}
    {(choice.action === "create" || (choice.action === "debt" && !choice.targetId)) && requiresConfirmation ? <label className="feature-checkbox"><input type="checkbox" checked={choice.confirmDuplicate ?? false} disabled={disabled} onChange={(e) => set({ confirmDuplicate: e.target.checked })} />Confirmo que é outra transação, mesmo com dados iguais</label> : null}
  </article>;
}

function fingerprint(row: ImportRow) { return `${row.date}:${row.signedAmountCents}:${normalizeDescription(row.description)}`; }

export function ImportsPanel({ data, today, busy, disabled, saveError, commit }: FinanceSectionProps) {
  const [sourceId, setSourceId] = useState(data.bankSources[0]?.id ?? "");
  const source = data.bankSources.find((s) => s.id === sourceId);
  const [sourceForm, setSourceForm] = useState<{ source: BankSource | null } | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [file, setFile] = useState<{ name: string; parsed: ImportFile } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState(today.slice(0, 7));
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ revision: number; batch: ImportBatch; choices: ImportChoice[]; duplicateRows: number[] } | null>(null);
  const [reviewPage, setReviewPage] = useState(0);
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const unavailable = disabled || reading;
  const stale = Boolean(review && review.revision !== data.revision);
  const activeCount = review?.choices.filter((c) => c.action !== "skip").length ?? 0;
  function resetFile() { request.current++; setFile(null); setMapping(null); setReview(null); setError(null); setReading(false); if (fileInput.current) fileInput.current.value = ""; }
  async function read(fileToRead: File | undefined) {
    if (!fileToRead || !source) return;
    const sequence = ++request.current;
    setReading(true); setError(null); setReview(null); setFile(null);
    try {
      if (fileToRead.size > 20 * 1024 * 1024) throw new Error("O extrato deve ter no máximo 20 MB.");
      const parsed = await readImportFile(fileToRead.name, await fileToRead.arrayBuffer());
      if (sequence !== request.current) return;
      const saved = source.mapping;
      setMapping(parsed.sheets.length ? saved && parsed.sheets.some((s) => s.name === saved.sheet) ? saved : suggestMapping(parsed.sheets[0], source.kind) : null);
      setFile({ name: fileToRead.name, parsed });
    } catch (cause) { if (sequence === request.current) setError(message(cause)); }
    finally { if (sequence === request.current) setReading(false); }
  }
  function prepareReview() {
    if (!file || !source) return;
    try {
      if (source.kind === "card" && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(invoiceMonth)) throw new Error("Confirme o mês de vencimento da fatura.");
      const sheet = file.parsed.sheets.find((s) => s.name === mapping?.sheet);
      const rows = file.parsed.ofxRows ?? (sheet && mapping ? normalizeSheet(sheet, mapping) : []);
      if (!rows.length) throw new Error("Não há linhas para importar. Confira a aba e o cabeçalho.");
      const counts = new Map<string, number>();
      const duplicateKey = (row: ImportRow) => row.externalId ? `id:${row.externalId}` : `fingerprint:${fingerprint(row)}`;
      for (const row of rows) counts.set(duplicateKey(row), (counts.get(duplicateKey(row)) ?? 0) + 1);
      const duplicateRows = rows.filter((row) => (counts.get(duplicateKey(row)) ?? 0) > 1).map((row) => row.row);
      const choices: ImportChoice[] = rows.map((row) => {
        const info = inspectImportRow(data, source, row, file.parsed.hash, invoiceMonth);
        const action = info.known || row.error || info.possibleDuplicate || duplicateRows.includes(row.row) || row.installmentNumber || row.hint === "invoice" ? "skip"
          : row.hint === "credit" || row.hint === "transfer" ? "ignore" : "create";
        return { row, action, category: info.category, invoiceMonth };
      });
      setReview({ revision: data.revision, batch: { sourceId: source.id, fileHash: file.parsed.hash, invoiceMonth, mapping }, choices, duplicateRows });
      setReviewPage(0); setError(null);
    } catch (cause) { setError(message(cause)); }
  }
  async function save() {
    if (!review) return;
    setError(null);
    // Validate before the write as well, so failures leave the review editable.
    try { applyImport(data, review.batch, review.choices); } catch (cause) { setError(message(cause)); return; }
    const saved = await commit((prev) => {
      if (prev.revision !== review.revision) throw new Error("Os dados mudaram. Refaça a revisão antes de importar.");
      return applyImport(prev, review.batch, review.choices);
    }, "Importação salva.");
    if (saved) resetFile(); else { setError("Não foi possível salvar. Refaça a revisão antes de tentar novamente."); setReview(null); }
  }
  return <section className="panel full-panel">
    <div className="panel-heading"><div><h2>Importar movimentações</h2><p className="quiet-label">Revise o extrato antes de cadastrar gastos ou vincular pagamentos.</p></div><Button size="sm" disabled={unavailable} onClick={() => { setReturnFocus(document.activeElement as HTMLElement); setSourceForm({ source: null }); }}><Plus size={14} />Nova origem</Button></div>
    <div className="panel-scroll finance-feature-content">
      <p className="field-hint">OFX, CSV, XLS e XLSX · Até 20 MB · Arquivos processados neste navegador. Cada conta ou cartão deve ter sua própria origem.</p>
      <BankImportGuide source={source} />
      <div className="import-setup-grid">
        <Field label="Origem bancária" id="import-source"><NativeSelect id="import-source" value={sourceId} disabled={unavailable} onChange={(e) => { resetFile(); setSourceId(e.target.value); }}><option value="">Selecione uma origem</option>{data.bankSources.map((s) => <option key={s.id} value={s.id}>{BANK_LABELS[s.bank]} · {s.name} · {s.kind === "card" ? "Cartão" : "Conta"}</option>)}</NativeSelect></Field>
        {source ? <Button variant="outline" disabled={unavailable} onClick={() => { setReturnFocus(document.activeElement as HTMLElement); setSourceForm({ source }); }}><Pencil size={14} />Editar origem</Button> : null}
        {source?.kind === "card" ? <Field label="Mês de vencimento da fatura" id="import-invoice"><Input id="import-invoice" type="month" min="1000-01" max="9999-12" value={invoiceMonth} disabled={unavailable || Boolean(review)} onChange={(e) => setInvoiceMonth(e.target.value)} /></Field> : null}
        <Field label="Arquivo de extrato" id="import-file"><Input id="import-file" ref={fileInput} type="file" accept=".ofx,.csv,.xls,.xlsx" disabled={unavailable || !source} onChange={(e) => { void read(e.target.files?.[0]); }} /></Field>
      </div>
      {!data.bankSources.length ? <div className="empty-state"><Upload size={28} /><h3>Comece identificando seu banco</h3><p>Crie uma origem para sua conta do BB, Mercado Pago ou Itaú, depois selecione o extrato.</p></div> : null}
      {reading ? <p role="status" className="feature-loading"><LoaderCircle className="animate-spin" size={16} />Lendo extrato…</p> : null}
      {error || (stale && review) ? <Alert variant="destructive"><AlertDescription>{stale ? "Os dados mudaram. Refaça a revisão antes de importar." : error}</AlertDescription></Alert> : null}
      {saveError ? <p role="status" className="field-hint">{saveError}</p> : null}
      {file && !review ? <div className="import-file-setup"><p><strong>{file.name}</strong></p>{mapping ? <MappingEditor sheets={file.parsed.sheets} mapping={mapping} disabled={unavailable} onChange={setMapping} /> : <p className="field-hint">Arquivo OFX: data, descrição, valor e identificador extraídos automaticamente.</p>}<Button disabled={unavailable} onClick={prepareReview}><Check size={14} />Revisar movimentações</Button></div> : null}
      {review && source ? <div className="import-review">
        <div className="feature-card-heading"><div><h3>Revise antes de importar</h3><p className="field-hint">{review.choices.length} linhas · {activeCount} decisões serão salvas. “Deixar sem alterar” mantém a linha pendente.</p></div><Button variant="outline" size="sm" disabled={unavailable} onClick={() => { setReview(null); setError(null); }}>Refazer revisão</Button></div>
        <p className="field-hint">“Ignorar” guarda a decisão para próximas importações. Pagamentos de fatura exigem valor integral igual aos itens cadastrados. Créditos e estornos não alteram os totais nesta versão.</p>
        {review.choices.slice(reviewPage * 20, reviewPage * 20 + 20).map((choice, index) => <ReviewRow key={choice.row.row} data={data} source={source} choice={choice} fileHash={review.batch.fileHash} invoiceMonth={review.batch.invoiceMonth} duplicateInFile={review.duplicateRows.includes(choice.row.row)} disabled={unavailable || stale} onChange={(next) => setReview((prev) => prev ? { ...prev, choices: prev.choices.map((c, i) => i === reviewPage * 20 + index ? next : c) } : prev)} />)}
        {review.choices.length > 20 ? <div className="feature-card-actions"><Button variant="outline" disabled={reviewPage === 0} onClick={() => setReviewPage((p) => p - 1)}>Anteriores</Button><span>Página {reviewPage + 1} de {Math.ceil(review.choices.length / 20)}</span><Button variant="outline" disabled={(reviewPage + 1) * 20 >= review.choices.length} onClick={() => setReviewPage((p) => p + 1)}>Próximas</Button></div> : null}
        <div className="import-save-bar"><Button disabled={unavailable || stale || activeCount === 0} onClick={() => { void save(); }}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}Salvar importação</Button></div>
      </div> : null}
      <details className="import-ledger"><summary>Movimentações registradas ({data.importRecords.filter((r) => !source || r.sourceId === source.id).length})</summary>
        <p className="field-hint">Para rever uma linha ignorada, selecione novamente o extrato e altere sua ação. A identidade permanece registrada mesmo após excluir um gasto.</p>
        {[...data.importRecords].reverse().filter((r) => !source || r.sourceId === source.id).slice(0, 100).map((r) => <div className="import-ledger-row" key={r.id}><strong>{r.description}</strong><small>{r.date ?? "Linha inválida"} · {r.signedAmountCents === null ? "Valor inválido" : formatMoney(r.signedAmountCents)} · {r.action === "ignore" ? "Ignorada" : r.action === "invoice" ? "Pagamento de fatura" : "Registrada"}</small></div>)}
      </details>
    </div>
    {sourceForm ? <SourceEditor data={data} source={sourceForm.source} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setSourceForm(null)} onSave={async (input, id) => {
      const sourceIdToSave = id ?? crypto.randomUUID();
      const saved = await commit((prev) => saveBankSource(prev, input, sourceIdToSave), "Origem salva.");
      if (saved) { resetFile(); setSourceId(sourceIdToSave); }
      return saved;
    }} /> : null}
  </section>;
}
