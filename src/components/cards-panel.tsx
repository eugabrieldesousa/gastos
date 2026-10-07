"use client";
import { Check, CreditCard as CardIcon, Pencil, Plus, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { ExpenseList, type ExpenseListProps } from "./expense-list";
import type { FinanceSectionProps } from "./debts-panel";
import { dateLabel, ensureInvoice, formatMoney, invoiceSummary, setInvoicePaid, type CreditCard, type Expense, type FinanceData } from "@/lib/finance";
export function CardsPanel({data, month, today, disabled, selectedCard, setSelectedCard, onEditCard, openExpense, commit, listProps}: {
  data: FinanceData; month: string; today: string; disabled: boolean; selectedCard: string;
  setSelectedCard: (id: string) => void; onEditCard: (card: CreditCard | null) => void;
  openExpense: (expense?: Expense | null, cardId?: string) => void; commit: FinanceSectionProps["commit"];
  listProps: Omit<ExpenseListProps, "expenses" | "hasExpenses">;
}) {
  const card = data.cards.find((card) => card.id === selectedCard) ?? data.cards[0];
  const invoice = card && month ? invoiceSummary(data, card.id, month) : null;
  return (
    <div className="cards-layout">
      <section className="panel cards-list">
        <div className="panel-heading">
          <h2>Seus cartões</h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Novo cartão"
            disabled={disabled}
            onClick={() => onEditCard(null)}
          >
            <Plus size={16} />
          </Button>
        </div>
        <div className="panel-scroll">
          {data.cards.map((c) => {
            const i = invoiceSummary(data, c.id, month);
            return (
              <button
                key={c.id}
                className={`card-tile ${card?.id === c.id ? "selected" : ""}`}
                onClick={() => setSelectedCard(c.id)}
              >
                <span className="card-tile-title">
                  <CardIcon size={18} />
                  <strong>{c.name}</strong>
                </span>
                <strong className="card-tile-value">
                  {formatMoney(i.total)}
                </strong>
                <small>
                  Vence dia {c.dueDay} · {i.paid ? "Paga" : "Em aberto"}
                </small>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="new-card-button"
          onClick={() => onEditCard(null)}
          disabled={disabled}
        >
          <Plus size={14} />
          Adicionar cartão
        </Button>
      </section>
      {card && invoice ? (
        <section className="panel invoice-panel">
          <div className="panel-heading">
            <div>
              <h2>Fatura · {card.name}</h2>
              <p className="quiet-label">
                Vencimento {dateLabel(invoice.dueDate)} · Fechamento dia{" "}
                {card.closingDay}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEditCard(card)}
              disabled={disabled}
            >
              <Pencil size={13} />
              Editar cartão
            </Button>
          </div>
          <div className="invoice-overview">
            <div>
              <span className="quiet-label">Total da fatura</span>
              <strong>{formatMoney(invoice.total)}</strong>
              <span
                className={`expense-status ${invoice.paid ? "is-paid" : invoice.dueDate < today ? "is-overdue" : "is-planned"}`}
              >
                {invoice.paid
                  ? "Paga"
                  : invoice.dueDate < today
                    ? "Em atraso"
                    : "Em aberto"}
              </span>
            </div>
            <div className="invoice-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || invoice.paid}
                onClick={() => openExpense(null, card.id)}
              >
                <Plus size={14} />
                Adicionar compra
              </Button>
              <Button
                size="sm"
                disabled={disabled || !invoice.items.length}
                onClick={() =>
                  void commit(
                    (prev) =>
                      setInvoicePaid(
                        prev,
                        card.id,
                        month,
                        !invoice.paid,
                      ),
                    invoice.paid
                      ? "Quitação desfeita."
                      : "Fatura quitada.",
                  )
                }
              >
                {invoice.paid ? (
                  <RefreshCw size={14} />
                ) : (
                  <Check size={14} />
                )}
                {invoice.paid ? "Desfazer quitação" : "Quitar fatura"}
              </Button>
              {!data.invoices.some(
                (i) => i.cardId === card.id && i.month === month,
              ) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    void commit(
                      (prev) => ensureInvoice(prev, card.id, month),
                      "Fatura criada.",
                    )
                  }
                >
                  Criar fatura
                </Button>
              ) : null}
            </div>
          </div>
          <div className="panel-scroll invoice-items">
            <div className="invoice-group-heading">
              <h3>Compras em uma vez</h3>
              <strong>{formatMoney(invoice.singleTotal)}</strong>
            </div>
            {invoice.singles.length ? (
              <ExpenseList
                {...listProps}
                expenses={invoice.singles}
                hasExpenses
              />
            ) : (
              <p className="small-empty">
                Nenhuma compra em uma vez nesta fatura.
              </p>
            )}
            <div className="invoice-group-heading">
              <h3>Parcelas do mês</h3>
              <strong>{formatMoney(invoice.installmentTotal)}</strong>
            </div>
            {invoice.installments.length ? (
              <ExpenseList
                {...listProps}
                expenses={invoice.installments}
                hasExpenses
              />
            ) : (
              <p className="small-empty">Nenhuma parcela neste mês.</p>
            )}
          </div>
          <div className="panel-footer">
            <span>Compras e parcelas somadas uma única vez</span>
            <strong>{invoice.items.length} lançamentos</strong>
          </div>
        </section>
      ) : (
        <section className="panel empty-state">
          <CardIcon size={30} />
          <h2>Suas faturas começam aqui</h2>
          <p>
            Adicione um cartão para reunir compras e parcelas por mês.
          </p>
          <Button
            onClick={() => onEditCard(null)}
            disabled={disabled}
          >
            Cadastrar cartão
          </Button>
        </section>
      )}
    </div>

  );
}
