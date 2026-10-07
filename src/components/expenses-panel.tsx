"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./finance-editor";
import { GroupedExpenses } from "./grouped-expenses";
import type { ExpenseListProps } from "./expense-list";
import { KIND_LABELS, formatMoney, type FinanceData, type ExpenseFilter } from "@/lib/finance";
export function ExpensesPanel({data, month, allExpenses, listProps, initialCategory = "", initialKind = "", initialFilter = "all"}: {
  data: FinanceData; month: string; allExpenses: ExpenseListProps["expenses"]; listProps: Omit<ExpenseListProps, "expenses" | "hasExpenses">;
  initialCategory?: string; initialKind?: string; initialFilter?: ExpenseFilter;
}) {
  const [filter, setFilter] = useState<ExpenseFilter>(initialFilter);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [kindFilter, setKindFilter] = useState(initialKind);
  const [search, setSearch] = useState("");
  function clearFilters() {setFilter("all"); setCategoryFilter(""); setKindFilter(""); setSearch("");}
  const filtered = allExpenses.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (!categoryFilter || e.category === categoryFilter) &&
      (!kindFilter || e.kind === kindFilter) &&
      e.description
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );

  return (
    <section className="panel expense-panel full-panel">
      <div className="panel-heading expense-filters">
        <h2>
          Seus gastos{" "}
          <span className="expense-count">{allExpenses.length}</span>
        </h2>
        <div
          className="status-filters"
          role="tablist"
          aria-label="Filtrar por situação"
        >
          {(
            [
              ["all", "Todos"],
              ["planned", "Previstos"],
              ["paid", "Pagos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-bar">
        <div className="search-input">
          <Search size={15} />
          <Input
            aria-label="Buscar gastos"
            placeholder="Buscar um gasto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Filtrar por categoria"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {data.categories.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filtrar por tipo"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        {search || filter !== "all" || categoryFilter || kindFilter ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X size={14} />
            Limpar
          </Button>
        ) : null}
      </div>
      <div className="panel-scroll">
        <GroupedExpenses
          key={`${filter}:${categoryFilter}:${kindFilter}:${search}`}
          {...listProps}
          data={data} month={month} filtering={Boolean(search || filter !== "all" || categoryFilter || kindFilter)}
          expenses={filtered}
          hasExpenses={allExpenses.length > 0}
        />
      </div>
      <div className="panel-footer">
        <span>
          {filtered.length} de {allExpenses.length} gastos
        </span>
        <strong>
          Total exibido:{" "}
          {formatMoney(
            filtered.reduce((sum, e) => sum + e.amountCents, 0),
          )}
        </strong>
      </div>
    </section>

  );
}
