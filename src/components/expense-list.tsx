"use client";

import type { CSSProperties } from "react";
import {
  Armchair,
  Banknote,
  BriefcaseBusiness,
  Bus,
  Car,
  Check,
  CircleEllipsis,
  Clock3,
  Coffee,
  HeartPulse,
  House,
  MoreHorizontal,
  Music,
  Pencil,
  Repeat2,
  Smartphone,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  KIND_LABELS,
  dateLabel,
  formatMoney,
  type Category,
  type Expense,
} from "@/lib/finance";

const icons: Record<Category["icon"], LucideIcon> = {
  home: House,
  food: Coffee,
  bus: Bus,
  health: HeartPulse,
  leisure: Armchair,
  music: Music,
  car: Car,
  work: BriefcaseBusiness,
  phone: Smartphone,
  subscription: Repeat2,
  other: CircleEllipsis,
};
export function CategoryMark({ category }: { category?: Category }) {
  const Icon = category ? icons[category.icon] : CircleEllipsis;
  return (
    <span
      className={category ? "category-mark data-color" : "category-mark"}
      style={
        category
          ? { "--data-color": category.color } as CSSProperties
          : undefined
      }
    >
      <Icon size={17} strokeWidth={1.7} />
    </span>
  );
}
type Props = {
  expenses: Expense[];
  categories: Category[];
  hasExpenses: boolean;
  disabled: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onToggle: (expense: Expense) => void;
  onAdd: () => void;
};
export function ExpenseList({
  expenses,
  categories,
  hasExpenses,
  disabled,
  onEdit,
  onDelete,
  onToggle,
  onAdd,
}: Props) {
  if (!expenses.length)
    return (
      <div className="empty-state">
        <Wallet size={28} className="text-primary" />
        <h3>
          {hasExpenses
            ? "Nenhum gasto com essa situação"
            : "Seu mês começa por aqui"}
        </h3>
        <p>
          {hasExpenses
            ? "Ajuste os filtros para encontrar seus lançamentos."
            : "Cadastre suas compras, assinaturas e contas para acompanhar o mês."}
        </p>
        {!hasExpenses ? (
          <Button variant="outline" onClick={onAdd} disabled={disabled}>
            Adicionar meu primeiro gasto
          </Button>
        ) : null}
      </div>
    );
  return (
    <div className="expense-table" role="table" aria-label="Lista de gastos">
      <div className="expense-table-head" role="row">
        <span role="columnheader">Descrição</span>
        <span role="columnheader">Vencimento</span>
        <span role="columnheader">Situação</span>
        <span role="columnheader" className="text-right">
          Valor
        </span>
        <span className="sr-only" role="columnheader">
          Ações
        </span>
      </div>
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="expense-item"
          role="row"
          data-testid="expense-row"
        >
          <div className="expense-description" role="cell">
            <CategoryMark
              category={categories.find((c) => c.name === expense.category)}
            />
            <div>
              <strong title={expense.description}>{expense.description}</strong>
              <small>
                {expense.category}
                <span> · </span>
                {expense.kind === "installment"
                  ? `${expense.installmentNumber}/${expense.installmentCount}`
                  : KIND_LABELS[expense.kind]}
                {expense.cardId ? " · Cartão" : ""}
                {expense.kind === "installment" && expense.debtId ? " · Combinado" : ""}
              </small>
            </div>
          </div>
          <span className="expense-date" role="cell">
            {dateLabel(expense.date)}
          </span>
          <span
            role="cell"
            className={`expense-status ${expense.status === "paid" ? "is-paid" : "is-planned"}`}
          >
            {expense.status === "paid" ? (
              <Check size={12} />
            ) : (
              <Clock3 size={12} />
            )}
            {expense.status === "paid" ? "Pago" : "Previsto"}
          </span>
          <div className="expense-amount" role="cell">
            <strong>{formatMoney(expense.amountCents)}</strong>
            <span
              className={`expense-mobile-status ${expense.status === "paid" ? "is-paid" : "is-planned"}`}
            >
              {expense.status === "paid" ? "Pago" : "Previsto"} ·{" "}
              {dateLabel(expense.date)}
            </span>
          </div>
          <div role="cell">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  data-expense-id={expense.id}
                  aria-label={`Ações para ${expense.description}`}
                  disabled={disabled}
                >
                  <MoreHorizontal size={17} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => onEdit(expense)}
                  disabled={Boolean(
                    expense.cardId && expense.status === "paid",
                  )}
                >
                  <Pencil />
                  {expense.kind === "installment" && expense.debtId ? expense.status === "paid" ? "Editar pagamento" : "Pagar parcela" : "Editar gasto"}
                </DropdownMenuItem>
                {!expense.cardId && expense.kind !== "debt" && (!(expense.kind === "installment" && expense.debtId) || expense.status === "paid") ? (
                  <DropdownMenuItem onSelect={() => onToggle(expense)}>
                    <Banknote />
                    {expense.kind === "installment" && expense.debtId ? "Desfazer pagamento" : expense.status === "paid"
                      ? "Marcar como previsto"
                      : "Marcar como pago"}
                  </DropdownMenuItem>
                ) : null}
                {!(expense.kind === "installment" && expense.debtId) ? <><DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(expense)}
                  disabled={Boolean(
                    expense.cardId && expense.status === "paid",
                  )}
                >
                  <Trash2 />
                  {expense.kind === "fixed"
                    ? "Excluir / encerrar recorrência"
                    : "Excluir gasto"}
                </DropdownMenuItem></> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
