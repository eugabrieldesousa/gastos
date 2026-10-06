"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field } from "./finance-editor";
import { parseDebtCostList } from "@/lib/debts";
import { formatMoney, MAX_CENTS, moneyInput, parseMoney, type DebtCost } from "@/lib/finance";

export type CostDraft = { id: string; description: string; amount: string };
export const blankCost = (): CostDraft => ({ id: crypto.randomUUID(), description: "", amount: "" });
export const costDraft = (cost: DebtCost): CostDraft => ({ id: cost.id, description: cost.description, amount: moneyInput(cost.amountCents) });

export function readCostDrafts(drafts: CostDraft[]): DebtCost[] {
  if (!drafts.length) throw new Error("Adicione pelo menos um custo à dívida.");
  const costs = drafts.map((draft, index) => {
    const description = draft.description.trim();
    const amountCents = parseMoney(draft.amount);
    if (!description || description.length > 120) throw new Error(`Informe a descrição do custo ${index + 1} (até 120 caracteres).`);
    if (amountCents === null || amountCents <= 0) throw new Error(`Informe um valor positivo em reais para o custo ${index + 1}.`);
    return { id: draft.id, description, amountCents };
  });
  if (costs.reduce((sum, cost) => sum + cost.amountCents, 0) > MAX_CENTS) throw new Error("O total dos custos ultrapassa o limite permitido.");
  return costs;
}

function CostRows({ value, onChange, onRemove, busy, prefix }: {
  value: CostDraft[]; onChange: (value: CostDraft[]) => void; onRemove?: (cost: CostDraft) => void; busy: boolean; prefix: string;
}) {
  function update(id: string, field: "description" | "amount", text: string) {
    onChange(value.map((cost) => cost.id === id ? { ...cost, [field]: text } : cost));
  }
  return <div className="cost-editor-rows">
    {value.map((cost, index) => <div className="cost-editor-row" key={cost.id}>
      <Field label={`Descrição do custo ${index + 1}`} id={`${prefix}-description-${cost.id}`}>
        <Input id={`${prefix}-description-${cost.id}`} value={cost.description} onChange={(e) => update(cost.id, "description", e.target.value)} placeholder="Ex.: Guincho" maxLength={120} disabled={busy} />
      </Field>
      <Field label={`Valor do custo ${index + 1}`} id={`${prefix}-amount-${cost.id}`}>
        <Input id={`${prefix}-amount-${cost.id}`} value={cost.amount} onChange={(e) => update(cost.id, "amount", e.target.value)} inputMode="decimal" placeholder="750,00" disabled={busy} />
      </Field>
      {onRemove ? <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={`Remover custo ${index + 1}`} onClick={() => onRemove(cost)}><Trash2 size={15} /></Button> : null}
    </div>)}
  </div>;
}

export function DebtCostFields({ value, onChange, busy, savedIds = [], allowMultiple = true }: {
  value: CostDraft[]; onChange: (value: CostDraft[]) => void; busy: boolean; savedIds?: string[]; allowMultiple?: boolean;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<CostDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CostDraft | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const amounts = value.map((cost) => parseMoney(cost.amount));
  const total = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const validTotal = value.length > 0 && amounts.every((amount) => amount !== null && amount > 0) && total <= MAX_CENTS;
  function remove(cost: CostDraft) {
    if (savedIds.includes(cost.id)) { setReturnFocus(document.activeElement as HTMLElement); setRemoving(cost); }
    else onChange(value.filter((c) => c.id !== cost.id));
  }
  function review() {
    try {
      const costs = parseDebtCostList(pasteText);
      setPreview(costs.map((cost) => costDraft({ ...cost, id: crypto.randomUUID() })));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revise a lista."); setPreview([]); }
  }
  function incorporate() {
    try {
      const costs = readCostDrafts(preview);
      // Replace the untouched initial row so pasting a list needs no extra cleanup.
      const existing = value.filter((cost) => savedIds.includes(cost.id) || cost.description.trim() || cost.amount.trim());
      readCostDrafts([...existing, ...costs.map(costDraft)]);
      onChange([...existing, ...costs.map(costDraft)]);
      setPreview([]); setPasteText(""); setPasteOpen(false); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revise a lista."); }
  }
  return <section className="debt-cost-editor" aria-label="Custos da dívida">
    <input type="hidden" name="costListPending" value={pasteText.trim() || preview.length ? "yes" : ""} />
    <CostRows value={value} onChange={onChange} onRemove={allowMultiple ? remove : undefined} busy={busy} prefix="cost" />
    {allowMultiple ? <div className="feature-card-actions">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onChange([...value, blankCost()])}><Plus size={14} />Adicionar item</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPasteOpen(!pasteOpen)} aria-expanded={pasteOpen}><ClipboardPaste size={14} />Colar lista</Button>
    </div> : null}
    {pasteOpen ? <div className="cost-paste-panel">
      <Field label="Lista de custos" id="cost-paste" hint="Uma linha por custo, com descrição e valor ao final. Ex.: Guincho R$ 750,00">
        <textarea id="cost-paste" className="cost-textarea" rows={5} value={pasteText} disabled={busy} onChange={(e) => { setPasteText(e.target.value); setPreview([]); setError(null); }} />
      </Field>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={review}>Revisar lista</Button>
      {preview.length ? <div className="cost-list-preview">
        <h4>Prévia da lista ({preview.length} itens)</h4>
        <CostRows value={preview} onChange={setPreview} onRemove={(cost) => setPreview(preview.filter((c) => c.id !== cost.id))} busy={busy} prefix="preview-cost" />
        <Button type="button" size="sm" disabled={busy} onClick={incorporate}>Incorporar itens</Button>
      </div> : null}
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setPasteText(""); setPreview([]); setPasteOpen(false); setError(null); }}>Descartar lista</Button>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </div> : null}
    <div className="cost-total" role="status"><span>Total dos custos</span><strong>{validTotal ? formatMoney(total) : "Informe os valores"}</strong></div>
    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>Remover custo?</AlertDialogTitle><AlertDialogDescription>O custo “{removing?.description}” será removido quando você salvar a dívida. O total e o saldo serão recalculados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (removing) onChange(value.filter((c) => c.id !== removing.id)); setRemoving(null); }}>Remover custo</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
