"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { dateLabel, formatMoney, moneyInput, monthSummary, parseMoney, saveIncome, type FinanceData, type Income } from "@/lib/finance";

export function IncomesPanel({ data, month, today, disabled, busy, onSalary, commit }: {
  data: FinanceData; month: string; today: string; disabled: boolean; busy: boolean; onSalary: () => void;
  commit: (change: (data: FinanceData) => FinanceData, message: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState<{ income: Income | null } | null>(null);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const summary = monthSummary(data, month);
  const items = data.incomes.filter((item) => item.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description, "pt-BR"));
  return <section className="panel incomes-panel">
    <div className="panel-heading"><h2><Banknote size={18} />Ganhos do mês</h2>
      <Button disabled={disabled} onClick={() => setForm({ income: null })}><Plus />Adicionar ganho</Button></div>
    <div className="panel-scroll income-scroll">
      <div className="income-totals">
        <div><span>Salário</span><strong>{summary.salary === null ? "Não informado" : formatMoney(summary.salary)}</strong>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onSalary}><Pencil />{summary.salary === null ? "Informar salário" : "Editar salário"}</Button></div>
        <div><span>Extras recebidos</span><strong data-testid="income-received">{formatMoney(summary.incomeReceived)}</strong></div>
        <div><span>Extras previstos</span><strong data-testid="income-planned">{formatMoney(summary.incomePlanned)}</strong></div>
        <div><span>Receita total prevista</span><strong data-testid="income-revenue">{summary.revenue === null ? "—" : formatMoney(summary.revenue)}</strong></div>
      </div>
      <p className="income-hint">Ganhos previstos entram na projeção e ainda não foram recebidos.{summary.salary === null && items.length > 0 ? " Salário não informado: o cálculo considera somente os ganhos extras." : ""}</p>
      {items.length ? <ul className="income-list">{items.map((item) => <li key={item.id}>
        <div><strong>{item.description}</strong><small>{dateLabel(item.date)} · {item.status === "received" ? "Recebido" : "Previsto"}</small></div>
        <strong>{formatMoney(item.amountCents)}</strong>
        <div className="income-actions">
          <Button variant="ghost" size="icon" aria-label={`Editar ganho ${item.description}`} disabled={disabled} onClick={() => setForm({ income: item })}><Pencil size={16} /></Button>
          <Button variant="ghost" size="icon" aria-label={`Excluir ganho ${item.description}`} disabled={disabled} onClick={() => setDeleting(item)}><Trash2 size={16} /></Button>
        </div>
      </li>)}</ul> : <div className="empty-state"><Banknote /><h3>Seus ganhos extras ficam aqui</h3><p>Adicione freelas e outras entradas além do salário.</p></div>}
    </div>
    {form && <IncomeEditor income={form.income} date={today.slice(0, 7) === month ? today : `${month}-01`} busy={busy} onClose={() => setForm(null)}
      onSave={(input) => commit((previous) => saveIncome(previous, input, form.income?.id), "Ganho salvo.")} />}
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir ganho?</AlertDialogTitle><AlertDialogDescription>O ganho {deleting?.description} será removido e os totais serão recalculados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={async () => {
          if (deleting && await commit((previous) => ({ ...previous, incomes: previous.incomes.filter((item) => item.id !== deleting.id) }), "Ganho excluído.")) setDeleting(null);
        }}>Excluir ganho</Button></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}

function IncomeEditor({ income, date, busy, onSave, onClose }: {
  income: Income | null; date: string; busy: boolean; onSave: (input: Omit<Income, "id">) => Promise<boolean>; onClose: () => void;
}) {
  const [description, setDescription] = useState(income?.description ?? "");
  const [amount, setAmount] = useState(income ? moneyInput(income.amountCents) : "");
  const [incomeDate, setDate] = useState(income?.date ?? date);
  const [status, setStatus] = useState<Income["status"]>(income?.status ?? "received");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoney(amount);
    if (amountCents === null || amountCents <= 0) { setError("Informe um valor maior que zero, como 1.234,56."); return; }
    setError("");
    if (await onSave({ description, amountCents, date: incomeDate, status })) onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="editor-modal">
    <DialogHeader><DialogTitle>{income ? "Editar ganho" : "Novo ganho"}</DialogTitle><DialogDescription>Registre um freela ou outra entrada. A data define o mês do ganho.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="income-description">Descrição do ganho</Label><Input id="income-description" required maxLength={120} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="income-amount">Valor do ganho (R$)</Label><Input id="income-amount" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} aria-describedby={error ? "income-error" : undefined} aria-invalid={Boolean(error)} /></div>
      <div className="space-y-2"><Label htmlFor="income-status">Situação do ganho</Label><select id="income-status" className="native-select" value={status} onChange={(event) => setStatus(event.target.value as Income["status"])} disabled={busy}><option value="received">Recebido</option><option value="planned">Previsto</option></select></div>
      <div className="space-y-2"><Label htmlFor="income-date">{status === "received" ? "Data do recebimento" : "Data prevista"}</Label><Input id="income-date" type="date" required min="1000-01-01" max="9999-12-31" value={incomeDate} onChange={(event) => setDate(event.target.value)} disabled={busy} /></div>
      {error && <p id="income-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar ganho"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
