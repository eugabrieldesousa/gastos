"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Repeat2 } from "lucide-react";
import { Button } from "./ui/button";
import { ExpenseList, type ExpenseListProps } from "./expense-list";
import { formatMoney, installmentSummaries, monthLabel, type FinanceData } from "@/lib/finance";
export function InstallmentsPanel({data, month, listProps, openExpense}: {
  data: FinanceData; month: string; listProps: Omit<ExpenseListProps, "expenses" | "hasExpenses">; openExpense: () => void;
}) {
  const [expandedPlan, setExpandedPlan] = useState("");
  const plans = useMemo(() => installmentSummaries(data, month), [data, month]);
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <h2>
          Compras parceladas{" "}
          <span className="expense-count">{plans.length}</span>
        </h2>
        <span className="quiet-label">
          Em aberto:{" "}
          {formatMoney(plans.reduce((sum, p) => sum + p.remaining, 0))}
        </span>
      </div>
      <div className="panel-scroll installment-list">
        {plans.length ? (
          plans.map((plan) => (
            <article key={plan.id} className="installment-card">
              <div className="installment-heading">
                <div>
                  <h3>{plan.description}</h3>
                  <p>
                    {plan.current
                      ? `Parcela ${plan.current.installmentNumber}/${plan.totalInstallments} neste mês`
                      : `Sem parcela em ${monthLabel(month)}`}{" "}
                    · Término em {monthLabel(plan.lastMonth)}
                  </p>
                </div>
                <strong>
                  {formatMoney(plan.remaining)}
                  <small>a pagar</small>
                </strong>
              </div>
              <div className="installment-progress" role="progressbar" aria-label={`Posição das parcelas de ${plan.description}`} aria-valuemin={0} aria-valuemax={plan.totalInstallments} aria-valuenow={plan.position} aria-valuetext={`Parcela ${plan.position} de ${plan.totalInstallments}; ${plan.paidCount} pagas registradas`}>
                <span
                  style={{
                    width: `${plan.progressPercent}%`,
                  }}
                />
              </div>
              <p className="installment-position">Posição: {plan.position}/{plan.totalInstallments} · A posição no calendário não indica quitação.</p>
              <div className="installment-meta">
                <span>
                  {plan.paidCount} pagas registradas · {plan.pendingCount}{" "}
                  pendentes
                </span>
                {plan.firstInstallment > 1 ? (
                  <span>
                    {plan.firstInstallment - 1} anteriores: histórico
                    informado
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setExpandedPlan(
                      expandedPlan === plan.id ? "" : plan.id,
                    )
                  }
                >
                  {expandedPlan === plan.id
                    ? "Ocultar parcelas"
                    : "Ver parcelas"}
                  <ChevronDown size={14} />
                </Button>
              </div>
              <div className="installment-state-legend">
                {plan.firstInstallment > 1 && <span className="installment-history">{plan.firstInstallment - 1} anteriores: histórico</span>}
                {plan.items.filter((item) => item.status === "paid" || item.id === plan.current?.id).map((item) => <span key={item.id} className={item.status === "paid" ? "is-paid" : "installment-current"}>
                  {item.installmentNumber}/{plan.totalInstallments} · {item.status === "paid" ? "Paga" : "Atual, pendente"}
                </span>)}
                <span className="is-planned">{plan.items.filter((item) => item.status === "planned" && item.id !== plan.current?.id).length} outras previstas</span>
              </div>
              {expandedPlan === plan.id ? (
                <ExpenseList
                  {...listProps}
                  expenses={plan.items}
                  hasExpenses
                />
              ) : null}
            </article>
          ))
        ) : (
          <div className="empty-state">
            <Repeat2 size={30} />
            <h2>Nenhum parcelamento cadastrado</h2>
            <p>
              Ao adicionar um gasto, escolha o tipo Parcelado. Você
              também pode começar por uma parcela em andamento.
            </p>
            <Button variant="outline" onClick={() => openExpense()}>
              Adicionar gasto parcelado
            </Button>
          </div>
        )}
      </div>
    </section>

  );
}
