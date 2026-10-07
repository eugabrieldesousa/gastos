"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { EditorModal, Field, NativeSelect, type ModalProps } from "./finance-editor";
import { debtInstallmentSummary } from "@/lib/debts";
import { dateLabel, formatMoney, type Debt, type Expense, type FinanceData } from "@/lib/finance";

export function DebtInstallmentPaymentEditor({ data, debt, today, installment, onSave, ...modal }: ModalProps & {
  data: FinanceData; debt: Debt; today: string; installment: Expense | null;
  onSave: (expenseId: string, date: string) => Promise<boolean>;
}) {
  const summary = debtInstallmentSummary(data, debt);
  const editing = installment?.status === "paid";
  const eligible = editing ? summary.items.filter((e) => e.id === installment.id) : summary.pending;
  const [selectedId, setSelectedId] = useState(installment?.id ?? eligible[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const selected = eligible.find((e) => e.id === selectedId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) { setError("A parcela não está mais disponível. Recarregue os dados."); return; }
    const date = String(new FormData(event.currentTarget).get("date") ?? "");
    if (await onSave(selected.id, date)) modal.onClose(); else setError("save");
  }
  return <EditorModal {...modal} title={editing ? "Editar pagamento da parcela" : "Pagar parcela"}
    description={`${debt.name} · ${debt.creditor}. O gasto entra no mês da data real do pagamento.`}
    submitLabel="Salvar pagamento da parcela" error={error} onSubmit={submit}>
    <Field label="Parcela do combinado" id="debt-payment-installment"><NativeSelect id="debt-payment-installment" value={selectedId} disabled={editing || modal.busy} onChange={(e) => setSelectedId(e.target.value)}>
      {eligible.map((e) => <option key={e.id} value={e.id}>{e.installmentNumber}/{e.installmentCount} · {formatMoney(e.amountCents)} · Vence {e.dueDate}</option>)}
    </NativeSelect></Field>
    {selected ? <p className="installment-payment-value">Valor da parcela: <strong>{formatMoney(selected.amountCents)}</strong><br />Vencimento combinado: {dateLabel(selected.dueDate!)} · {selected.dueDate!.slice(0, 4)}</p> : null}
    <Field label="Data real do pagamento" id="debt-payment-date"><Input id="debt-payment-date" name="date" type="date" min="1000-01-01" max={today} defaultValue={editing ? installment.date : today} disabled={modal.busy} required /></Field>
  </EditorModal>;
}
