"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Check, LoaderCircle } from "lucide-react";
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
import { moneyInput, monthLabel, parseMoney } from "@/lib/finance";

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
