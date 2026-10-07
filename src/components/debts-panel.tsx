"use client";

import { Fragment, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Banknote, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditorModal, Field, NativeSelect, type ModalProps } from "./finance-editor";
import { blankCost, costDraft, DebtCostFields, readCostDrafts } from "./debt-cost-fields";
import { DebtInstallmentPaymentEditor } from "./debt-installment-payment-editor";
import { debtInstallmentSummary, debtSummary, removeDebtCost, saveDebt, saveDebtCosts, saveDebtPayment, setDebtInstallmentPayment, updateDebtCost, type DebtSaveInput } from "@/lib/debts";
import { dateLabel, formatMoney, installmentAmount, moneyInput, monthLabel, parseMoney, removeOccurrence, type Debt, type DebtCost, type Expense, type ExpenseInput, type FinanceData } from "@/lib/finance";

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
  onSave: (input: DebtSaveInput, id?: string) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<Debt["type"]>(debt?.type ?? "fixed");
  const [costs, setCosts] = useState(() => debt?.costs.length ? debt.costs.map(costDraft) : [blankCost()]);
  const plan = debt?.type === "installment" ? debtInstallmentSummary(data, debt) : null;
  const [totalInput, setTotalInput] = useState(debt ? moneyInput(debt.originalCents) : "");
  const [count, setCount] = useState(plan?.plan.totalInstallments ?? 12);
  const [paidCount, setPaidCount] = useState(plan?.historicalCount ?? 0);
  const total = parseMoney(totalInput);
  const validPreview = total !== null && Number.isInteger(count) && count >= 2 && count <= 360 && total >= count;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      if (type === "itemized" && text(form, "costListPending")) throw new Error("Incorpore os itens da lista ou descarte a lista antes de salvar.");
      const items = type === "itemized" ? readCostDrafts(costs) : [];
      const input: DebtSaveInput = { name: text(form, "name"), creditor: text(form, "creditor"), category: text(form, "category"),
        type, description: text(form, "description"), costs: items,
        originalCents: type === "itemized" ? items.reduce((sum, cost) => sum + cost.amountCents, 0) : money(form, "original"),
        downPaymentCents: type === "installment" ? 0 : money(form, "downPayment"),
        historicalPaidCents: type === "installment" ? debt?.historicalPaidCents ?? 0 : money(form, "historical"),
        startMonth: type === "installment" ? debt?.startMonth ?? text(form, "firstDueDate").slice(0, 7) : text(form, "startMonth"),
        installmentPlanId: debt?.installmentPlanId ?? null };
      if (type === "installment" && !debt) input.schedule = { count, paidCount, firstDueDate: text(form, "firstDueDate") };
      if (input.originalCents === 0) throw new Error("O valor original deve ser maior que zero.");
      if (type !== "installment" && input.startMonth > today.slice(0, 7)) throw new Error("O acompanhamento deve começar no mês atual ou antes.");
      if (await onSave(input, debt?.id)) modal.onClose(); else setError("save");
    } catch (cause) { setError(errorMessage(cause)); }
  }
  return <EditorModal {...modal} title={debt ? "Editar dívida" : "Nova dívida"}
    description={type === "installment" ? "Combinado sem juros. As parcelas ficam previstas e você confirma cada pagamento manualmente." : "Dívida sem juros, com pagamentos de valores diferentes. Entrada e histórico não criam gastos retroativos."}
    submitLabel={debt ? "Salvar dívida" : "Cadastrar dívida"} error={error} onSubmit={submit}>
    <Field label="Tipo de dívida" id="debt-type" hint={debt ? "O tipo é definido no cadastro." : type === "installment" ? "Parcelas previstas mensalmente, com confirmação manual do pagamento." : type === "itemized" ? "O total é a soma dos itens, e novos custos aumentam o saldo." : "Valor original definido, com pagamentos de valores diferentes."}><NativeSelect id="debt-type" value={type} disabled={Boolean(debt) || modal.busy} onChange={(e) => setType(e.target.value as Debt["type"])}>
      <option value="fixed">Valor fixo</option><option value="itemized">Por custos</option><option value="installment">Parcelamento combinado</option>
    </NativeSelect></Field>
    <Field label="Nome da dívida" id="debt-name"><Input id="debt-name" name="name" defaultValue={debt?.name} placeholder="Ex.: Carro" maxLength={120} required /></Field>
    <Field label="Descrição geral (opcional)" id="debt-description"><textarea id="debt-description" name="description" className="cost-textarea" rows={2} maxLength={1000} defaultValue={debt?.description} placeholder="Ex.: Reparos do carro" /></Field>
    <Field label="Credor" id="debt-creditor"><Input id="debt-creditor" name="creditor" defaultValue={debt?.creditor} placeholder="Ex.: Meu pai" maxLength={120} required /></Field>
    <Field label="Categoria" id="debt-category"><NativeSelect id="debt-category" name="category" defaultValue={debt?.category ?? "Carro"}>
      {data.categories.filter((c) => !c.archived || c.name === debt?.category).map((c) => <option key={c.id}>{c.name}</option>)}
    </NativeSelect></Field>
    {type === "itemized" ? <DebtCostFields value={costs} onChange={setCosts} busy={modal.busy} savedIds={debt?.costs.map((cost) => cost.id)} />
      : type === "installment" ? <Field label="Valor total" id="debt-original"><Input id="debt-original" name="original" inputMode="decimal" value={totalInput} onChange={(e) => setTotalInput(e.target.value)} readOnly={Boolean(debt)} required /></Field>
      : <Field label="Valor original" id="debt-original" hint="Valor total antes da entrada e dos pagamentos."><Input id="debt-original" name="original" inputMode="decimal" defaultValue={debt ? moneyInput(debt.originalCents) : ""} required /></Field>}
    {type === "installment" ? <Fragment key="installment-terms">
      <div className="form-grid">
        <Field label="Quantidade de parcelas" id="debt-count"><Input id="debt-count" type="number" min={2} max={360} value={count} onChange={(e) => setCount(Number(e.target.value))} readOnly={Boolean(debt)} required /></Field>
        <Field label="Parcelas já pagas" id="debt-paid-count" hint="Histórico anterior, sem criar gastos retroativos."><Input id="debt-paid-count" type="number" min={0} max={count - 1} value={paidCount} onChange={(e) => setPaidCount(Number(e.target.value))} readOnly={Boolean(debt)} required /></Field>
      </div>
      <Field label="Vencimento da primeira parcela restante" id="debt-first-due"><Input id="debt-first-due" name="firstDueDate" type="date" min="1000-01-01" max="9999-12-31" defaultValue={plan?.items[0].dueDate ?? today} readOnly={Boolean(debt)} required /></Field>
      <p className="cost-total" role="status">{validPreview ? <><span>{count} parcelas</span><strong>{installmentAmount(total, count, 1) === installmentAmount(total, count, count) ? `${count}× de ${formatMoney(installmentAmount(total, count, 1))}` : `${formatMoney(installmentAmount(total, count, count))} a ${formatMoney(installmentAmount(total, count, 1))} por parcela`}</strong></> : "Informe o total e a quantidade para calcular as parcelas."}</p>
      {debt ? <p className="field-hint">Valor, quantidade, histórico e calendário foram definidos no cadastro.</p> : null}
    </Fragment> : <Fragment key="variable-terms"><div className="form-grid">
      <Field label="Entrada" id="debt-down"><Input id="debt-down" name="downPayment" inputMode="decimal" defaultValue={moneyInput(debt?.downPaymentCents ?? 0)} required /></Field>
      <Field label="Já pago depois da entrada" id="debt-historical"><Input id="debt-historical" name="historical" inputMode="decimal" defaultValue={moneyInput(debt?.historicalPaidCents ?? 0)} required /></Field>
    </div>
    <Field label="Início do acompanhamento" id="debt-start" hint="O histórico acima é anterior a este período e não entra na média mensal."><Input id="debt-start" name="startMonth" type="month" min="1000-01" max={today.slice(0, 7)} defaultValue={debt?.startMonth ?? today.slice(0, 7)} required /></Field></Fragment>}
  </EditorModal>;
}

function CostEditor({ debt, cost, onSave, ...modal }: ModalProps & {
  debt: Debt; cost: DebtCost | null; onSave: (costs: DebtCost[]) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [costs, setCosts] = useState(() => [cost ? costDraft(cost) : blankCost()]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (text(new FormData(event.currentTarget), "costListPending")) throw new Error("Incorpore os itens da lista ou descarte a lista antes de salvar.");
      if (await onSave(readCostDrafts(costs))) modal.onClose(); else setError("save");
    } catch (cause) { setError(errorMessage(cause)); }
  }
  return <EditorModal {...modal} title={cost ? "Editar custo" : "Adicionar custo"} description={`${debt.name}. Os custos compõem a dívida; registre os pagamentos separadamente.`}
    submitLabel={cost ? "Salvar custo" : "Salvar custos"} error={error} onSubmit={submit}>
    <DebtCostFields value={costs} onChange={setCosts} busy={modal.busy} allowMultiple={!cost} />
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
  const [costForm, setCostForm] = useState<{ debt: Debt; cost: DebtCost | null } | null>(null);
  const [deletingCost, setDeletingCost] = useState<{ debt: Debt; cost: DebtCost } | null>(null);
  const [costDeleteError, setCostDeleteError] = useState<string | null>(null);
  const [expandedCosts, setExpandedCosts] = useState<Record<string, boolean>>({});
  const [installmentForm, setInstallmentForm] = useState<{ debt: Debt; installment: Expense | null } | null>(null);
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
        const installments = debt.type === "installment" ? debtInstallmentSummary(data, debt) : null;
        return <article className="debt-card" key={debt.id}>
          <div className="feature-card-heading"><div><h3>{debt.name}</h3><p className="quiet-label">{debt.creditor} · {debt.category} · Sem juros · {debt.type === "itemized" ? "Por custos" : debt.type === "installment" ? "Parcelamento combinado" : "Valor fixo"}</p></div>
            <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar dívida ${debt.name}`} onClick={() => { focus(); setEditing({ debt }); }}><Pencil size={15} /></Button>
          </div>
          {debt.description ? <p className="debt-description">{debt.description}</p> : null}
          <div className="debt-metrics"><div><small>{debt.type === "itemized" ? "Total dos custos" : debt.type === "installment" ? "Valor total" : "Valor original"}</small><strong>{formatMoney(debt.originalCents)}</strong></div><div><small>{debt.type === "installment" ? "Total pago" : "Total amortizado"}</small><strong>{formatMoney(summary.amortized)}</strong></div><div><small>Saldo restante</small><strong>{formatMoney(summary.remaining)}</strong></div></div>
          {debt.type === "itemized" ? <section className="debt-cost-list" aria-label={`Custos de ${debt.name}`}>
            <div className="feature-card-heading"><Button variant="ghost" size="sm" aria-expanded={Boolean(expandedCosts[debt.id])} aria-controls={`debt-costs-${debt.id}`} onClick={() => setExpandedCosts((prev) => ({ ...prev, [debt.id]: !prev[debt.id] }))}><ChevronDown className="debt-expand-icon" data-expanded={Boolean(expandedCosts[debt.id])} size={14} />Custos ({debt.costs.length})</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => { focus(); setCostForm({ debt, cost: null }); }}><Plus size={14} />Adicionar custo</Button></div>
            <ul id={`debt-costs-${debt.id}`} hidden={!expandedCosts[debt.id]}>{debt.costs.map((cost) => <li className="debt-cost-row" key={cost.id}>
              <span>{cost.description}</span><strong>{formatMoney(cost.amountCents)}</strong>
              <div className="debt-cost-actions">
                <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar custo ${cost.description}`} onClick={() => { focus(); setCostForm({ debt, cost }); }}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Excluir custo ${cost.description}`} onClick={() => { focus(); setCostDeleteError(null); setDeletingCost({ debt, cost }); }}><Trash2 size={14} /></Button>
              </div>
            </li>)}</ul>
          </section> : null}
          <progress className="debt-progress" aria-label={`Progresso de ${debt.name}`} max={debt.originalCents} value={summary.amortized} />
          {installments ? <>
            <p className="debt-forecast">{installments.paidCount}/{installments.plan.totalInstallments} parcelas quitadas{summary.remaining === 0 ? " · Quitada" : ""}</p>
            <p className="field-hint">Combinado: {installments.plan.totalInstallments}× {installments.firstAmount === installments.lastAmount ? `de ${formatMoney(installments.firstAmount)}` : `entre ${formatMoney(installments.lastAmount)} e ${formatMoney(installments.firstAmount)}`} · Último vencimento combinado: {installments.lastDueDate}</p>
            <p className="field-hint">{installments.nextDueDate ? `Próximo vencimento pendente: ${installments.nextDueDate}${installments.nextDueDate < today ? " · Em atraso" : ""}` : "Todas as parcelas foram pagas."}</p>
            <div className="feature-card-actions"><Button variant="outline" size="sm" disabled={disabled || !installments.pending.length} onClick={() => { focus(); setInstallmentForm({ debt, installment: null }); }}>Pagar parcela</Button></div>
            <details className="debt-history debt-installment-history"><summary>Parcelas ({installments.plan.totalInstallments})</summary>
              {installments.historicalCount ? <p className="field-hint">{installments.historicalCount} parcelas anteriores: histórico informado · {formatMoney(debt.historicalPaidCents)}. Sem gastos retroativos.</p> : null}
              {installments.items.map((item) => <div className="payment-history-row debt-installment-row" key={item.id}>
                <div><strong>Parcela {item.installmentNumber}/{item.installmentCount}</strong><small>Vencimento: {item.dueDate}</small><small>{item.status === "paid" ? `Pago em ${item.date}` : item.dueDate! < today ? "Prevista · Em atraso" : "Prevista"}</small></div>
                <strong>{formatMoney(item.amountCents)}</strong>
                <div className="debt-installment-actions"><Button variant="outline" size="sm" disabled={disabled} aria-label={`${item.status === "paid" ? "Editar pagamento da" : "Pagar"} parcela ${item.installmentNumber}`} onClick={() => { focus(); setInstallmentForm({ debt, installment: item }); }}>{item.status === "paid" ? "Editar data" : "Pagar"}</Button>
                  {item.status === "paid" ? <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Desfazer pagamento da parcela ${item.installmentNumber}`} onClick={() => { void commit((prev) => setDebtInstallmentPayment(prev, item.id, null, today), "Pagamento desfeito."); }}>Desfazer</Button> : null}</div>
              </div>)}
            </details>
          </> : <><p className="debt-forecast">{summary.remaining === 0 ? "Quitada" : summary.endMonth ? `Previsão de quitação: ${monthLabel(summary.endMonth)} · ${summary.monthsRemaining} mês(es)` : "Sem previsão suficiente"}</p>
          <p className="field-hint">Média mensal: {formatMoney(summary.averageCents)} · {summary.months.length ? `Meses completos: ${summary.months.map(monthLabel).join(", ")}. Meses sem pagamento contam como zero.` : "Ainda não há um mês completo de acompanhamento."} A previsão não cria gastos futuros.</p>
          <div className="feature-card-actions"><Button variant="outline" size="sm" disabled={disabled || summary.remaining === 0} onClick={() => { focus(); setPaymentForm({ debt, payment: null }); }}><Plus size={14} />Registrar pagamento</Button></div>
          <details className="debt-history"><summary>Histórico de pagamentos ({summary.payments.length})</summary>
            <p className="field-hint">Entrada: {formatMoney(debt.downPaymentCents)} · Histórico anterior: {formatMoney(debt.historicalPaidCents)}</p>
            {summary.payments.map((payment) => <div className="payment-history-row" key={payment.id}><div><strong>{payment.description}</strong><small>{dateLabel(payment.date)} · {payment.date.slice(0, 4)}</small></div><strong>{formatMoney(payment.amountCents)}</strong>
              <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar pagamento ${payment.description}`} onClick={() => { focus(); setPaymentForm({ debt, payment }); }}><Pencil size={14} /></Button>
              <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Excluir pagamento ${payment.description}`} onClick={() => { focus(); setDeleting(payment); }}><Trash2 size={14} /></Button>
            </div>)}
          </details></>}
        </article>;
      })}
    </div>
    {editing ? <DebtEditor data={data} today={today} debt={editing.debt} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setEditing(null)} onSave={(input, id) => commit((prev) => saveDebt(prev, input, id), "Dívida salva.")} /> : null}
    {installmentForm ? <DebtInstallmentPaymentEditor data={data} debt={installmentForm.debt} today={today} installment={installmentForm.installment} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setInstallmentForm(null)} onSave={(id, date) => commit((prev) => setDebtInstallmentPayment(prev, id, date, today), "Parcela paga.")} /> : null}
    {costForm ? <CostEditor debt={costForm.debt} cost={costForm.cost} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setCostForm(null)} onSave={(costs) => commit((prev) => costForm.cost
      ? updateDebtCost(prev, costForm.debt.id, costForm.cost.id, { description: costs[0].description, amountCents: costs[0].amountCents })
      : saveDebtCosts(prev, costForm.debt.id, costs.map(({ description, amountCents }) => ({ description, amountCents }))), "Custos salvos.")} /> : null}
    {paymentForm ? <PaymentEditor data={data} today={today} debt={paymentForm.debt} payment={paymentForm.payment} busy={busy} saveError={saveError} returnFocus={returnFocus} onClose={() => setPaymentForm(null)} onSave={(input, id) => commit((prev) => saveDebtPayment(prev, paymentForm.debt.id, input, id, today), "Pagamento salvo.")} /> : null}
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus?.focus(); }}>
      <AlertDialogHeader><AlertDialogTitle>Excluir pagamento?</AlertDialogTitle><AlertDialogDescription>O gasto será removido e o saldo da dívida será recalculado.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async (event) => { event.preventDefault(); if (deleting && await commit((prev) => removeOccurrence(prev, deleting, "one"), "Pagamento excluído.")) setDeleting(null); }}>Excluir pagamento</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(deletingCost)} onOpenChange={(open) => { if (!open && !busy) { setDeletingCost(null); setCostDeleteError(null); } }}><AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus(); }}>
      <AlertDialogHeader><AlertDialogTitle>Excluir custo?</AlertDialogTitle><AlertDialogDescription>O custo “{deletingCost?.cost.description}” será removido e o total e o saldo da dívida serão recalculados. Os pagamentos serão preservados.</AlertDialogDescription></AlertDialogHeader>
      {costDeleteError ? <p className="cost-delete-error" role="alert">{saveError ?? costDeleteError}</p> : null}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async (event) => {
        event.preventDefault();
        if (deletingCost && await commit((prev) => removeDebtCost(prev, deletingCost.debt.id, deletingCost.cost.id), "Custo excluído.")) setDeletingCost(null);
        else setCostDeleteError("Não foi possível excluir o custo. Revise o saldo da dívida.");
      }}>Excluir custo</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}
