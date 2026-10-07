"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightLeft, Banknote, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney, moneyInput, monthLabel, parseMoney, shiftMonth } from "@/lib/finance";

type BaseProps = {
  onClose: () => void;
  busy: boolean;
  returnFocus: HTMLElement | null;
};

function restoreFocus(target: HTMLElement | null) {
  const visible = target?.isConnected && target.getClientRects().length > 0;
  (visible
    ? target
    : document.querySelector<HTMLButtonElement>("[data-add-expense]")
  )?.focus();
}

export function BalanceTransferDialog({ month, available, existing, nextSummary, onSave, onClose, busy, returnFocus }: BaseProps & {
  month: string; available: number | null; existing: number;
  nextSummary: { salary: number | null; incomeReceived: number; incomePlanned: number; revenue: number | null; total: number; ownRemaining: number | null };
  onSave: (cents: number | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(moneyInput(existing || Math.max(available ?? 0, 0)));
  const [error, setError] = useState<string | null>(null);
  const cents = parseMoney(value);
  const validAmount = cents !== null && cents > 0 && available !== null && cents <= available;
  const projectedRemaining = validAmount && nextSummary.ownRemaining !== null ? nextSummary.ownRemaining + cents : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = parseMoney(value);
    if (cents === null || cents <= 0 || available === null || cents > available) {
      setError("Informe um valor positivo que não ultrapasse a sobra disponível.");
      return;
    }
    setError(null);
    if (await onSave(cents)) onClose();
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="editor-modal sm:max-w-[480px]" onCloseAutoFocus={(event) => {
      event.preventDefault(); restoreFocus(returnFocus);
    }}>
      <DialogHeader>
        <div className="dialog-icon"><ArrowRightLeft size={22} /></div>
        <DialogTitle>Simulação do próximo mês</DialogTitle>
        <DialogDescription>De {monthLabel(month)} para {monthLabel(shiftMonth(month, 1))}.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="space-y-5 pt-2">
        <div className="space-y-2">
          <Label htmlFor="transfer-value">Valor da sobra a transferir</Label>
          <Input id="transfer-value" inputMode="decimal" autoComplete="off" value={value}
            disabled={busy} onChange={(event) => setValue(event.target.value)}
            aria-invalid={Boolean(error)} aria-describedby={error ? "transfer-error" : "transfer-hint"} />
          <p id="transfer-hint" className="text-xs text-muted-foreground">Sobra disponível: {available === null ? "receita não informada" : formatMoney(available)}.</p>
          <p className="text-xs text-muted-foreground">O valor confirmado fica salvo. Alterar os gastos deste mês depois não muda a transferência.</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3" aria-label="Previsão do próximo mês">
          <p className="text-sm font-medium">Previsão para {monthLabel(shiftMonth(month, 1))}</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt>Salário cadastrado</dt><dd>{nextSummary.salary === null ? "Não informado" : formatMoney(nextSummary.salary)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Ganhos extras recebidos e previstos</dt><dd>{formatMoney(nextSummary.incomeReceived + nextSummary.incomePlanned)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Gastos pagos e previstos</dt><dd>{formatMoney(nextSummary.total)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Sobra a receber</dt><dd data-testid="simulation-received">{validAmount ? formatMoney(cents) : "—"}</dd></div>
            <div className="flex justify-between gap-3 border-t pt-2 font-semibold"><dt>Sobra prevista</dt><dd data-testid="simulation-remaining">{projectedRemaining === null ? "—" : formatMoney(projectedRemaining)}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">{nextSummary.revenue === null ? "Informe o salário ou ganhos do próximo mês para calcular a sobra total. " : nextSummary.salary === null ? "Salário não informado; o cálculo usa ganhos extras. " : ""}Simulação com as receitas e gastos cadastrados; os valores podem mudar. Nada é salvo até confirmar a sobra.</p>
        </div>
        {error && <Alert variant="destructive"><AlertDescription id="transfer-error">{error}</AlertDescription></Alert>}
        <DialogFooter className="transfer-dialog-footer">
          {existing > 0 && <Button type="button" variant="ghost" className="text-destructive" disabled={busy}
            onClick={async () => { if (await onSave(null)) onClose(); }}>Remover transferência</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || available === null || available <= 0}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Check />}Confirmar sobra
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function SalaryDialog({
  month,
  salary,
  onSave,
  onClose,
  busy,
  returnFocus,
}: BaseProps & {
  month: string;
  salary: number | null;
  onSave: (cents: number) => Promise<boolean>;
}) {
  const [value, setValue] = useState(salary === null ? "" : moneyInput(salary));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = parseMoney(value);
    if (cents === null) {
      setError(
        "Informe um valor válido, como 5.000,00. O salário pode ser zero.",
      );
      return;
    }
    setError(null);
    if (await onSave(cents)) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="editor-modal sm:max-w-[440px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus(returnFocus);
        }}
      >
        <DialogHeader>
          <div className="dialog-icon">
            <Banknote size={22} />
          </div>
          <DialogTitle>Seu salário do mês</DialogTitle>
          <DialogDescription>
            Informe o valor para {monthLabel(month)}. Os outros meses continuam
            iguais.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="salary-value">Salário líquido</Label>
            <div className="relative">
              <span className="money-prefix">R$</span>
              <Input
                id="salary-value"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="h-14 pl-12 text-xl! tabular-nums"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "salary-error" : "salary-hint"}
              />
            </div>
            <p id="salary-hint" className="text-xs text-muted-foreground">
              O valor que entra na sua conta, depois dos descontos.
            </p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription id="salary-error">{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
              Salvar salário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
