"use client";

import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ComponentProps,
} from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  KIND_LABELS,
  dateInMonth,
  isValidDate,
  moneyInput,
  parseMoney,
  suggestInvoiceMonth,
  type Category,
  type CreditCard,
  type Expense,
  type ExpenseInput,
  type FinanceData,
  type NewExpense,
} from "@/lib/finance";

export type ModalProps = {
  onClose: () => void;
  busy: boolean;
  returnFocus?: HTMLElement | null;
  saveError?: string | null;
};
export function EditorModal({
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  error,
  busy,
  onClose,
  returnFocus,
  saveError,
}: ModalProps & {
  title: string;
  description: string;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  error: string | null;
}) {
  const initialFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="editor-modal"
        onOpenAutoFocus={() => {
          initialFocus.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus ?? initialFocus.current;
          (target?.isConnected && target.getClientRects().length > 0
            ? target
            : document.querySelector<HTMLElement>("[data-add-expense]")
          )?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="editor-form">
          <div className="editor-fields">{children}</div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error === "save"
                  ? (saveError ?? "Não foi possível salvar. Tente novamente.")
                  : error}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
export function NativeSelect({
  id,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <select id={id} className="native-select" {...props}>
      {children}
    </select>
  );
}
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Não foi possível salvar. Tente novamente.";

export function ExpenseEditor({
  data,
  month,
  today,
  expense,
  initialCardId,
  onSave,
  onNewCategory,
  ...modal
}: ModalProps & {
  data: FinanceData;
  month: string;
  today: string;
  expense: Expense | null;
  initialCardId?: string;
  onSave: (
    input: NewExpense | ExpenseInput,
    expense: Expense | null,
    scope: "one" | "future",
  ) => Promise<boolean>;
  onNewCategory: () => void;
}) {
  const [kind, setKind] = useState<Expense["kind"]>(expense?.kind ?? "single");
  const [cardId, setCardId] = useState(expense?.cardId ?? initialCardId ?? "");
  const [date, setDate] = useState(
    expense?.date ?? (today.slice(0, 7) === month ? today : `${month}-01`),
  );
  const [invoiceMonth, setInvoiceMonth] = useState(month);
  const [first, setFirst] = useState(1);
  const [error, setError] = useState<string | null>(null);
  function updateSuggestion(id: string, value: string) {
    const card = data.cards.find((c) => c.id === id);
    if (card && isValidDate(value))
      setInvoiceMonth(suggestInvoiceMonth(card, value));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const amountCents = parseMoney(text(form, "amount"));
      if (amountCents === null || amountCents <= 0)
        throw new Error("Informe um valor maior que zero, como 120,50.");
      const description = text(form, "description").trim();
      if (!description || description.length > 120)
        throw new Error("Dê um nome ao gasto, com até 120 caracteres.");
      if (!isValidDate(date))
        throw new Error("Selecione uma data válida para o gasto.");
      const card = data.cards.find((c) => c.id === cardId);
      const accountingDate = expense
        ? date
        : card
          ? dateInMonth(invoiceMonth, card.dueDay)
          : date;
      const input: NewExpense = {
        description,
        amountCents,
        category: text(form, "category"),
        date: accountingDate,
        status: kind === "debt" ? "paid" : card ? "planned" : (text(form, "status") as Expense["status"]),
        kind,
        debtId: kind === "debt" ? text(form, "debtId") || expense?.debtId || null : null,
        cardId: cardId || null,
        purchaseDate: expense?.purchaseDate ?? (card ? date : null),
        endMonth: text(form, "endMonth") || null,
        dueDay: card?.dueDay ?? Number(accountingDate.slice(8)),
        totalInstallments: Number(text(form, "count") || 2),
        firstInstallment: first,
      };
      setError(null);
      if (
        await onSave(
          input,
          expense,
          text(form, "scope") === "future" ? "future" : "one",
        )
      )
        modal.onClose();
      else setError("save");
    } catch (cause) {
      setError(message(cause));
    }
  }
  const categories = data.categories.filter(
    (c) => !c.archived || c.name === expense?.category,
  );
  return (
    <EditorModal
      {...modal}
      title={expense ? "Editar gasto" : "Adicionar gasto"}
      description={
        expense?.seriesId
          ? "Escolha se a alteração vale só para esta ocorrência ou para as seguintes."
          : "Organize uma compra, uma conta mensal ou um parcelamento."
      }
      submitLabel={expense ? "Salvar alterações" : "Salvar gasto"}
      error={error}
      onSubmit={submit}
    >
      <Field label="Descrição" id="expense-description">
        <Input
          id="expense-description"
          name="description"
          defaultValue={expense?.description}
          maxLength={120}
          placeholder="Ex.: Seguro do carro, Spotify, mercado"
        />
      </Field>
      <div className="form-grid">
        <Field label="Tipo de gasto" id="expense-kind">
          <NativeSelect
            id="expense-kind"
            value={kind}
            disabled={Boolean(expense)}
            onChange={(e) => {
              setKind(e.target.value as Expense["kind"]);
              if (e.target.value === "debt") setCardId("");
            }}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Categoria" id="expense-category">
          <NativeSelect
            id="expense-category"
            name="category"
            defaultValue={expense?.category ?? "Outros"}
          >
            {categories.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="inline-category"
        onClick={onNewCategory}
      >
        <Plus size={14} />
        Criar categoria
      </Button>
      <Field
        label={
          expense || kind !== "installment"
            ? "Valor"
            : first > 1
              ? "Valor de cada parcela"
              : "Valor total da compra"
        }
        id="expense-amount"
        hint={
          kind === "fixed"
            ? "Este valor será previsto todos os meses até você encerrar a recorrência."
            : kind === "installment" && !expense
              ? first > 1
                ? "As parcelas anteriores serão identificadas como histórico informado."
                : "O total será dividido entre as parcelas, sem perder centavos."
              : undefined
        }
      >
        <Input
          id="expense-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={expense ? moneyInput(expense.amountCents) : ""}
          placeholder="0,00"
        />
      </Field>
      <div className="form-grid">
        <Field label="Pagamento" id="expense-card">
          <NativeSelect
            id="expense-card"
            value={cardId}
            disabled={Boolean(expense) || kind === "debt"}
            onChange={(e) => {
              setCardId(e.target.value);
              if (!initialCardId) updateSuggestion(e.target.value, date);
            }}
          >
            <option value="">Direto / fora do cartão</option>
            {data.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Data"
          id="expense-date"
          hint={
            cardId && !expense
              ? "Data da compra; confira a fatura sugerida abaixo."
              : "Data do gasto ou vencimento."
          }
        >
          <Input
            id="expense-date"
            type="date"
            value={date}
            disabled={Boolean(expense?.cardId)}
            onChange={(e) => {
              setDate(e.target.value);
              if (!initialCardId) updateSuggestion(cardId, e.target.value);
            }}
          />
        </Field>
      </div>
      {kind === "debt" ? (
        <Field label="Dívida" id="expense-debt" hint="Cadastre a dívida na seção Dívidas. Este pagamento reduz o saldo e entra nos gastos do mês.">
          <NativeSelect id="expense-debt" name="debtId" defaultValue={expense?.debtId ?? ""} required>
            <option value="">Selecione a dívida</option>
            {data.debts.map((debt) => <option key={debt.id} value={debt.id}>{debt.name} · {debt.creditor}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      {cardId && !expense ? (
        <Field
          label={kind === "installment" ? "Primeira fatura" : "Fatura"}
          id="expense-invoice"
          hint="Mês de vencimento. Ajuste se o banco lançar a compra em outro ciclo."
        >
          <Input
            id="expense-invoice"
            type="month"
            value={invoiceMonth}
            min="1000-01"
            max="9999-12"
            onChange={(e) => setInvoiceMonth(e.target.value)}
            required
          />
        </Field>
      ) : null}
      {!cardId && kind !== "debt" ? (
        <Field label="Situação" id="expense-status">
          <NativeSelect
            id="expense-status"
            name="status"
            defaultValue={
              expense?.status ?? (kind === "single" ? "paid" : "planned")
            }
          >
            <option value="paid">Pago</option>
            <option value="planned">Previsto</option>
          </NativeSelect>
        </Field>
      ) : cardId ? (
        <p className="field-hint">A situação acompanha a quitação da fatura.</p>
      ) : <p className="field-hint">Pagamentos de dívida são registrados como pagos.</p>}
      {kind === "installment" && !expense ? (
        <div className="form-grid">
          <Field label="Total de parcelas" id="expense-count">
            <Input
              id="expense-count"
              name="count"
              type="number"
              min={2}
              max={360}
              defaultValue={2}
              required
            />
          </Field>
          <Field label="Parcela inicial" id="expense-first">
            <Input
              id="expense-first"
              type="number"
              min={1}
              max={360}
              value={first}
              onChange={(e) => setFirst(Number(e.target.value))}
              required
            />
          </Field>
        </div>
      ) : null}
      {kind === "fixed" && !expense ? (
        <Field label="Último mês (opcional)" id="expense-end">
          <Input
            id="expense-end"
            name="endMonth"
            type="month"
            min={cardId ? invoiceMonth : date.slice(0, 7)}
            max="9999-12"
          />
        </Field>
      ) : null}
      {expense?.seriesId ? (
        <Field label="Aplicar alteração" id="expense-scope">
          <NativeSelect id="expense-scope" name="scope">
            <option value="one">Somente esta ocorrência</option>
            <option value="future">Esta e as seguintes</option>
          </NativeSelect>
        </Field>
      ) : null}
    </EditorModal>
  );
}

export function CategoryEditor({
  category,
  onSave,
  ...modal
}: ModalProps & {
  category: Category | null;
  onSave: (
    input: Omit<Category, "id" | "archived">,
    id?: string,
  ) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <EditorModal
      {...modal}
      title={category ? "Editar categoria" : "Nova categoria"}
      description="Escolha um nome, uma cor e um ícone para reconhecer seus gastos."
      submitLabel="Salvar categoria"
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          if (
            await onSave(
              {
                name: text(form, "name"),
                color: text(form, "color"),
                icon: text(form, "icon") as Category["icon"],
              },
              category?.id,
            )
          )
            modal.onClose();
          else setError("save");
        } catch (cause) {
          setError(message(cause));
        }
      }}
    >
      <Field label="Nome da categoria" id="category-name">
        <Input
          id="category-name"
          name="name"
          defaultValue={category?.name}
          required
          maxLength={60}
          placeholder="Ex.: Estudos"
        />
      </Field>
      <div className="form-grid">
        <Field label="Cor" id="category-color">
          <Input
            id="category-color"
            name="color"
            type="color"
            defaultValue={category?.color ?? CATEGORY_COLORS[0]}
          />
        </Field>
        <Field label="Ícone" id="category-icon">
          <NativeSelect
            id="category-icon"
            name="icon"
            defaultValue={category?.icon ?? "other"}
          >
            {CATEGORY_ICONS.map((icon, index) => (
              <option key={icon} value={icon}>
                {
                  [
                    "Casa",
                    "Alimentação",
                    "Transporte",
                    "Saúde",
                    "Lazer",
                    "Música",
                    "Carro",
                    "Trabalho",
                    "Telefone",
                    "Assinatura",
                    "Outros",
                  ][index]
                }
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </EditorModal>
  );
}

export function CardEditor({
  card,
  onSave,
  ...modal
}: ModalProps & {
  card: CreditCard | null;
  onSave: (input: Omit<CreditCard, "id">, id?: string) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <EditorModal
      {...modal}
      title={card ? "Editar cartão" : "Novo cartão"}
      description="Cadastre as datas para organizar as compras nas faturas mensais."
      submitLabel="Salvar cartão"
      error={error}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          if (
            await onSave(
              {
                name: text(form, "name"),
                closingDay: Number(text(form, "closing")),
                dueDay: Number(text(form, "due")),
              },
              card?.id,
            )
          )
            modal.onClose();
          else setError("save");
        } catch (cause) {
          setError(message(cause));
        }
      }}
    >
      <Field label="Nome do cartão" id="card-name">
        <Input
          id="card-name"
          name="name"
          defaultValue={card?.name}
          required
          maxLength={60}
          placeholder="Ex.: Nubank, Itaú"
        />
      </Field>
      <div className="form-grid">
        <Field label="Dia do fechamento" id="card-closing">
          <Input
            id="card-closing"
            name="closing"
            type="number"
            min={1}
            max={31}
            defaultValue={card?.closingDay ?? 25}
            required
          />
        </Field>
        <Field label="Dia do vencimento" id="card-due">
          <Input
            id="card-due"
            name="due"
            type="number"
            min={1}
            max={31}
            defaultValue={card?.dueDay ?? 5}
            required
          />
        </Field>
      </div>
      <p className="field-hint">
        Em meses curtos, dias 29, 30 ou 31 usam o último dia do mês.
      </p>
    </EditorModal>
  );
}
