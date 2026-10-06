"use client";

import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditorModal, Field, NativeSelect, type ModalProps } from "./finance-editor";
import { debtSummary, saveDebt, saveDebtPayment } from "@/lib/debts";
import { dateLabel, formatMoney, moneyInput, monthLabel, parseMoney, removeOccurrence, type Debt, type Expense, type ExpenseInput, type FinanceData } from "@/lib/finance";

export type FinanceSectionProps = {
  data: FinanceData; today: string; busy: boolean; disabled: boolean; saveError: string | null;
  commit: (change: (data: FinanceData) => FinanceData, message: string) => Promise<boolean>;
};
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível salvar.";
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function money(form: FormData, key: string) {
  const amount = parseMoney(text(form, key));
  if (amount === null) throw new Error("Informe valores em reais, como 1.234,56. Use zero quando não houver entrada ou histórico.");
  return amount;
}

function DebtEditor({ data, today, debt, onSave, ...modal }: ModalProps & {
  data: FinanceData; today: string; debt: Debt | null;
  onSave: (input: Omit<Debt, "id">, id?: string) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const input = { name: text(form, "name"), creditor: text(form, "creditor"), category: text(form, "category"),
        originalCents: money(form, "original"), downPaymentCents: money(form, "downPayment"),
        historicalPaidCents: money(form, "historical"), startMonth: text(form, "startMonth") };
      if (input.originalCents === 0) throw new Error("O valor original deve ser maior que zero.");
      if (input.startMonth > today.slice(0, 7)) throw new Error("O acompanhamento deve começar no mês atual ou antes.");
      if (await onSave(input, debt?.id)) modal.onClose(); else setError("save");
    } catch (cause) { setError(errorMessage(cause)); }
  }
  return <EditorModal {...modal} title={debt ? "Editar dívida" : "Nova dívida"}
    description="Dívida sem juros, com pagamentos de valores diferentes. Entrada e histórico não criam gastos retroativos."
    submitLabel={debt ? "Salvar dívida" : "Cadastrar dívida"} error={error} onSubmit={submit}>
    <Field label="Nome da dívida" id="debt-name"><Input id="debt-name" name="name" defaultValue={debt?.name} placeholder="Ex.: Carro" maxLength={120} required /></Field>
    <Field label="Credor" id="debt-creditor"><Input id="debt-creditor" name="creditor" defaultValue={debt?.creditor} placeholder="Ex.: Meu pai" maxLength={120} required /></Field>
    <Field label="Categoria" id="debt-category"><NativeSelect id="debt-category" name="category" defaultValue={debt?.category ?? "Carro"}>
      {data.categories.filter((c) => !c.archived || c.name === debt?.category).map((c) => <option key={c.id}>{c.name}</option>)}
    </NativeSelect></Field>
    <Field label="Valor original" id="debt-original" hint="Valor total antes da entrada e dos pagamentos."><Input id="debt-original" name="original" inputMode="decimal" defaultValue={debt ? moneyInput(debt.originalCents) : ""} required /></Field>
    <div className="form-grid">
      <Field label="Entrada" id="debt-down"><Input id="debt-down" name="downPayment" inputMode="decimal" defaultValue={moneyInput(debt?.downPaymentCents ?? 0)} required /></Field>
      <Field label="Já pago depois da entrada" id="debt-historical"><Input id="debt-historical" name="historical" inputMode="decimal" defaultValue={moneyInput(debt?.historicalPaidCents ?? 0)} required /></Field>
    </div>
    <Field label="Início do acompanhamento" id="debt-start" hint="O histórico acima é anterior a este período e não entra na média mensal."><Input id="debt-start" name="startMonth" type="month" min="1000-01" max={today.slice(0, 7)} defaultValue={debt?.startMonth ?? today.slice(0, 7)} required /></Field>
  </EditorModal>;
}

function PaymentEditor({ data, debt, today, payment, onSave, ...modal }: ModalProps & {
  data: FinanceData; debt: Debt; today: string; payment: Expense | null;
  onSave: (input: ExpenseInput, id?: string) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState(payment?.id ?? "");
  const selected = data.expenses.find((e) => e.id === existingId);
  const eligible = data.expenses.filter((e) => !e.cardId && !e.seriesId && !e.debtId && e.date.slice(0, 7) >= debt.startMonth && e.date <= today);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const input: ExpenseInput = { description: text(form, "description"), amountCents: money(form, "amount"),
        category: debt.category, date: text(form, "date"), status: "paid" };
      if (input.amountCents <= 0) throw new Error("O pagamento deve ser maior que zero.");
      if (await onSave(input, existingId || undefined)) modal.onClose(); else setError("save");
    } catch (cause) { setError(errorMessage(cause)); }
  }
  return <EditorModal {...modal} title={payment ? "Editar pagamento" : "Registrar pagamento"}
    description={`${debt.name} · ${debt.creditor}. O pagamento aparece uma única vez nos gastos.`}
    submitLabel="Salvar pagamento" onSubmit={submit} error={error}>
    {!payment ? <Field label="Gasto existente" id="payment-existing" hint="Vincule um gasto já registrado para não cadastrar outro.">
      <NativeSelect id="payment-existing" value={existingId} onChange={(e) => setExistingId(e.target.value)}><option value="">Criar novo pagamento</option>
        {eligible.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.description} · {formatMoney(e.amountCents)}</option>)}
      </NativeSelect>
    </Field> : null}
    <div key={existingId} className="editor-fields">
      <Field label="Descrição" id="payment-description"><Input id="payment-description" name="description" maxLength={120} defaultValue={selected?.description ?? `Pagamento · ${debt.name}`} required /></Field>
      <div className="form-grid">
        <Field label="Valor pago" id="payment-amount"><Input id="payment-amount" name="amount" inputMode="decimal" defaultValue={selected ? moneyInput(selected.amountCents) : ""} required /></Field>
        <Field label="Data do pagamento" id="payment-date"><Input id="payment-date" name="date" type="date" min={`${debt.startMonth}-01`} max={today} defaultValue={selected?.date ?? today} required /></Field>
      </div>
    </div>
  </EditorModal>;
}

export function DebtsPanel({ data, today, busy, disabled, saveError, commit }: FinanceSectionProps) {
  const [editing, setEditing] = useState<{ debt: Debt | null } | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ debt: Debt; payment: Expense | null } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  function focus() { setReturnFocus(document.activeElement as HTMLElement); }
  return <section className="panel full-panel">
    <div className="panel-heading"><div><h2>Suas dívidas</h2><p className="quiet-label">Acompanhe o saldo e a previsão de quitação, mesmo pagando valores diferentes.</p></div>
      <Button size="sm" disabled={disabled} onClick={() => { focus(); setEditing({ debt: null }); }}><Plus size={14} />Nova dívida</Button>
    </div>
    <div className="panel-scroll finance-feature-content">
      {!data.debts.length ? <div className="empty-state"><Banknote size={28} /><h3>Quanto falta para quitar?</h3><p>Cadastre a dívida com seu pai, a entrada e o total já pago. Depois, acompanhe cada pagamento.</p></div> : null}
      {data.debts.map((debt) => {
        const summary = debtSummary(data, debt, today);
        return <article className="debt-card" key={debt.id}>
          <div className="feature-card-heading"><div><h3>{debt.name}</h3><p className="quiet-label">{debt.creditor} · {debt.category} · Sem juros</p></div>
            <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar dívida ${debt.name}`} onClick={() => { focus(); setEditing({ debt }); }}><Pencil size={15} /></Button>
          </div>
          <div className="debt-metrics"><div><small>Valor original</small><strong>{formatMoney(debt.originalCents)}</strong></div><div><small>Total amortizado</small><strong>{formatMoney(summary.amortized)}</strong></div><div><small>Saldo restante</small><strong>{formatMoney(summary.remaining)}</strong></div></div>
          <progress className="debt-progress" aria-label={`Progresso de ${debt.name}`} max={debt.originalCents} value={summary.amortized} />
          <p className="debt-forecast">{summary.remaining === 0 ? "Quitada" : summary.endMonth ? `Previsão de quitação: ${monthLabel(summary.endMonth)} · ${summary.monthsRemaining} mês(es)` : "Sem previsão suficiente"}</p>
          <p className="field-hint">Média mensal: {formatMoney(summary.averageCents)} · {summary.months.length ? `Meses completos: ${summary.months.map(monthLabel).join(", ")}. Meses sem pagamento contam como zero.` : "Ainda não há um mês completo de acompanhamento."} A previsão não cria gastos futuros.</p>
          <div className="feature-card-actions"><Button variant="outline" size="sm" disabled={disabled || summary.remaining === 0} onClick={() => { focus(); setPaymentForm({ debt, payment: null }); }}><Plus size={14} />Registrar pagamento</Button></div>
          <details className="debt-history"><summary>Histórico de pagamentos ({summary.payments.length})</summary>
            <p className="field-hint">Entrada: {formatMoney(debt.downPaymentCents)} · Histórico anterior: {formatMoney(debt.historicalPaidCents)}</p>
            {summary.payments.map((payment) => <div className="payment-history-row" key={payment.id}><div><strong>{payment.description}</strong><small>{dateLabel(payment.date)} · {payment.date.slice(0, 4)}</small></div><strong>{formatMoney(payment.amountCents)}</strong>
              <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar pagamento ${payment.description}`} onClick={() => { focus(); setPaymentForm({ debt, payment }); }}><Pencil size={14} /></Button>
              <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Excluir pagamento ${payment.description}`} onClick={() => { focus(); setDeleting(payment); }}><Trash2 size={14} /></Button>
            </div>)}
          </details>
        </article>;
      })}
    </div>
    {editing ? <DebtEditor data={data} today={today} debt={editing.debt} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setEditing(null)} onSave={(input, id) => commit((prev) => saveDebt(prev, input, id), "Dívida salva.")} /> : null}
    {paymentForm ? <PaymentEditor data={data} today={today} debt={paymentForm.debt} payment={paymentForm.payment} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setPaymentForm(null)} onSave={(input, id) => commit((prev) => saveDebtPayment(prev, paymentForm.debt.id, input, id, today), "Pagamento salvo.")} /> : null}
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus?.focus(); }}>
      <AlertDialogHeader><AlertDialogTitle>Excluir pagamento?</AlertDialogTitle><AlertDialogDescription>O gasto será removido e o saldo da dívida será recalculado.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async (event) => { event.preventDefault(); if (deleting && await commit((prev) => removeOccurrence(prev, deleting, "one"), "Pagamento excluído.")) setDeleting(null); }}>Excluir pagamento</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}
