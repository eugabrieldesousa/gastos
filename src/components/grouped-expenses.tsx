"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Clock3, CreditCard } from "lucide-react";
import { ExpenseList, type ExpenseListProps } from "./expense-list";
import { dateLabel, formatMoney, invoiceSummary, type FinanceData } from "@/lib/finance";

export function GroupedExpenses({ data, month, filtering, ...listProps }: ExpenseListProps & {
  data: FinanceData; month: string; filtering: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!listProps.expenses.length) return <ExpenseList {...listProps} />;
  const direct = listProps.expenses.filter((item) => !item.cardId);
  return <div className="grouped-expenses">
    {data.cards.map((card) => {
      const items = listProps.expenses.filter((item) => item.cardId === card.id);
      if (!items.length) return null;
      const invoice = invoiceSummary(data, card.id, month);
      const key = `${card.id}:${month}`;
      const open = expanded[key] ?? filtering;
      const subtotal = items.reduce((sum, item) => sum + item.amountCents, 0);
      const overdue = !invoice.paid && invoice.dueDate < (listProps.today ?? "");
      const StatusIcon = invoice.paid ? Check : overdue ? AlertCircle : Clock3;
      const status = invoice.paid ? "Paga" : overdue ? "Em atraso" : "Em aberto";
      return <section className="invoice-group" key={key} aria-label={`Fatura ${card.name}`}>
        <button className="invoice-group-toggle" aria-expanded={open} aria-controls={`invoice-${card.id}-${month}`}
          onClick={() => setExpanded((previous) => ({ ...previous, [key]: !open }))}>
          <span className="invoice-group-icon"><CreditCard size={20} /></span>
          <span className="invoice-group-description"><strong>Fatura · {card.name}</strong>
            <small>Vence {dateLabel(invoice.dueDate)} · {invoice.items.length} compras{filtering ? ` · ${items.length} encontradas` : ""}</small>
          </span>
          <span className={`expense-status ${invoice.paid ? "is-paid" : overdue ? "is-overdue" : "is-planned"}`}><StatusIcon size={13} />{status}</span>
          <span className="invoice-group-total"><strong>{formatMoney(invoice.total)}</strong>
            {filtering && <small>Filtrado: {formatMoney(subtotal)}</small>}
          </span>
          <ChevronDown size={17} className={open ? "rotate-180" : ""} />
        </button>
        {open && <div id={`invoice-${card.id}-${month}`} className="invoice-group-items">
          <ExpenseList {...listProps} expenses={items} />
        </div>}
      </section>;
    })}
    {direct.length > 0 && <section aria-label="Gastos fora do cartão" className="direct-expenses">
      <div className="expense-group-label"><h3>Fora do cartão</h3><span>{direct.length} gastos</span></div>
      <ExpenseList {...listProps} expenses={direct} />
    </section>}
  </div>;
}
