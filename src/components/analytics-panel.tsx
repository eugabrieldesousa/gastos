"use client";
import { useMemo } from "react";
import { ChartPie, Clock3, Sparkles } from "lucide-react";
import { FinanceChart } from "./finance-chart";
import { KIND_LABELS, dateLabel, expensesForMonth, formatMoney, groupExpenses, invoiceSummary, monthLabel, monthSummary, shiftMonth, type Expense, type FinanceData } from "@/lib/finance";
export function AnalyticsPanel({ data, month, today, onMonthChange, onOpenUpcoming, selectCategory, selectKind }: {
  data: FinanceData; month: string; today: string; onMonthChange: (month: string) => void;
  onOpenUpcoming: (cardId: string | null) => void; selectCategory: (category: string) => void; selectKind: (kind: string) => void;
}) {
  const allExpenses = useMemo(() => expensesForMonth(data, month), [data, month]);
  const summary = monthSummary(data, month);
  const categoryGroups = useMemo(
    () => groupExpenses(allExpenses, "category"),
    [allExpenses],
  );
  const kindGroups = useMemo(
    () => groupExpenses(allExpenses, "kind"),
    [allExpenses],
  );
  const forecasts = useMemo(
    () =>
      month
        ? Array.from({ length: 6 }, (_, i) => shiftMonth(month, i + 1))
            .filter((m) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(m))
            .map((m) => ({ month: m, summary: monthSummary(data, m) }))
        : [],
    [data, month],
  );
  const previousMonth = month && month > "1000-01" ? shiftMonth(month, -1) : "";
  const previous = monthSummary(data, previousMonth);
  const hasPrevious = expensesForMonth(data, previousMonth).length > 0;
  const upcoming = useMemo(() => {
    if (!month) return [];
    const months = month < "9999-12" ? [month, shiftMonth(month, 1)] : [month];
    return months
      .flatMap((m) => {
        const direct = expensesForMonth(data, m)
          .filter((e) => !e.cardId && e.status === "planned")
          .map((e) => ({
            id: e.id,
            description: e.description,
            date: e.date,
            amount: e.amountCents,
            month: m,
            cardId: null as string | null,
          }));
        const invoices = data.cards
          .map((c) => ({ ...invoiceSummary(data, c.id, m), name: c.name }))
          .filter((i) => !i.paid && i.total > 0)
          .map((i) => ({
            id: `${i.cardId}:${m}`,
            description: `Fatura · ${i.name}`,
            date: i.dueDate,
            amount: i.total,
            month: m,
            cardId: i.cardId,
          }));
        return [...direct, ...invoices];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, month]);

  return (
    <>
      <div className="overview-main">
        <div className="charts-grid">
          <FinanceChart
            title="Por categoria"
            slices={categoryGroups.map((g) => ({
              ...g,
              key: g.name,
              color:
                data.categories.find((c) => c.name === g.name)?.color ??
                "#31745b",
            }))}
            onSelect={selectCategory}
          />
          <FinanceChart
            title="Por tipo de gasto"
            slices={kindGroups.map((g) => ({
              ...g,
              key: g.name,
              name: KIND_LABELS[g.name as Expense["kind"]],
              color: {
                single: "#2563eb",
                fixed: "#0891b2",
                installment: "#d97706",
                debt: "#9333ea",
              }[g.name as Expense["kind"]],
            }))}
            onSelect={selectKind}
          />
        </div>

      </div>
      <aside className="overview-aside">
        <section className="panel insights-panel">
          <div className="panel-heading">
            <h2>
              <Sparkles size={16} />
              Análise do mês
            </h2>
          </div>
          <div
            className={`insights-body ${summary.revenue !== null && summary.total > summary.revenue ? "commitment-danger" : summary.revenue !== null && summary.total >= summary.revenue * 0.8 ? "commitment-warning" : ""}`}
            tabIndex={0}
            role="region"
            aria-label="Detalhes da análise do mês"
          >
            <div className="salary-insight">
              <strong>
                {summary.revenue !== null && summary.revenue > 0
                  ? `${Math.round((summary.total / summary.revenue) * 100)}%`
                  : "—"}
              </strong>
              <span>
                {summary.revenue === null
                  ? "Informe o salário ou ganhos para analisar o comprometimento."
                  : summary.revenue === 0
                    ? "Receita zero: os gastos são exibidos na sobra prevista."
                    : "da receita prevista comprometida"}
              </span>
            </div>
            <div className="commitment-track">
              <span
                style={{
                  width: `${summary.revenue && summary.revenue > 0 ? Math.min(100, (summary.total / summary.revenue) * 100) : 0}%`,
                }}
              />
            </div>
            <p>
              {categoryGroups.length ? (
                <>
                  <strong>{categoryGroups[0].name}</strong> concentra{" "}
                  {(
                    (categoryGroups[0].value / summary.total) *
                    100
                  ).toFixed(1)}
                  % dos gastos.
                </>
              ) : (
                "Cadastre seus gastos para descobrir onde seu dinheiro está concentrado."
              )}
            </p>
            <p>
              {hasPrevious ? (
                <>
                  Você registrou{" "}
                  <strong>
                    {formatMoney(
                      Math.abs(summary.total - previous.total),
                    )}{" "}
                    {summary.total >= previous.total
                      ? "a mais"
                      : "a menos"}
                  </strong>{" "}
                  que no mês anterior.
                </>
              ) : (
                "Registre outro mês para comparar a evolução dos gastos."
              )}
            </p>
          </div>
        </section>
        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <h2>
              <Clock3 size={15} />
              Próximos vencimentos
            </h2>
            <span className="expense-count">{upcoming.length}</span>
          </div>
          <div className="panel-scroll">
            {upcoming.length ? (
              upcoming.map((item) => (
                <button
                  key={item.id}
                  className="upcoming-item"
                  onClick={() => {
                    onMonthChange(item.month);
                    onOpenUpcoming(item.cardId);
                  }}
                >
                  <span>
                    <strong>{item.description}</strong>
                    <small
                      className={item.date < today ? "overdue" : ""}
                    >
                      {dateLabel(item.date)}
                      {item.date < today ? " · Em atraso" : ""}
                    </small>
                  </span>
                  <strong>{formatMoney(item.amount)}</strong>
                </button>
              ))
            ) : (
              <p className="small-empty">
                Nenhum vencimento pendente neste mês ou no próximo.
              </p>
            )}
          </div>
        </section>
        <section className="panel forecast-panel">
          <div className="panel-heading">
            <h2>
              <ChartPie size={15} />
              Próximos meses
            </h2>
          </div>
          <div className="panel-scroll">
            {forecasts.map((item) => (
              <button
                key={item.month}
                className="forecast-item"
                onClick={() => onMonthChange(item.month)}
              >
                <span>{monthLabel(item.month)}</span>
                <span className="forecast-values"><strong>Gastos: {formatMoney(item.summary.total)}</strong><small>Receita: {item.summary.revenue === null ? "—" : formatMoney(item.summary.revenue)} · Sobra: {item.summary.remaining === null ? "—" : formatMoney(item.summary.remaining)}</small></span>
              </button>
            ))}
          </div>
          <p className="forecast-hint">
            Compromissos cadastrados; valores podem mudar.
          </p>
        </section>
      </aside>
    </>

  );
}
