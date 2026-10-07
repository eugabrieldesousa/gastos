"use client";
import { Archive, Pencil, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { CategoryMark } from "./expense-list";
import type { FinanceSectionProps } from "./debts-panel";
import type { Category, Expense, FinanceData } from "@/lib/finance";
export function CategoriesPanel({data, allExpenses, disabled, onEditCategory, commit}: {
  data: FinanceData; allExpenses: Expense[]; disabled: boolean; onEditCategory: (category: Category | null) => void; commit: FinanceSectionProps["commit"];
}) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading">
        <div>
          <h2>Suas categorias</h2>
          <p className="quiet-label">
            Organize os gastos do seu jeito. Arquivar preserva o
            histórico.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => onEditCategory(null)}
          disabled={disabled}
        >
          <Plus size={14} />
          Nova categoria
        </Button>
      </div>
      <div className="panel-scroll categories-grid">
        {data.categories.map((category) => (
          <article
            key={category.id}
            className={`category-card ${category.archived ? "archived" : ""}`}
          >
            <CategoryMark category={category} />
            <div className="category-details">
              <h3>{category.name}</h3>
              <small>
                {category.archived
                  ? "Arquivada"
                  : `${allExpenses.filter((e) => e.category === category.name).length} gastos no mês`}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar categoria ${category.name}`}
              disabled={disabled}
              onClick={() => onEditCategory(category)}
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${category.archived ? "Reativar" : "Arquivar"} categoria ${category.name}`}
              disabled={
                disabled ||
                (!category.archived &&
                  data.categories.filter((c) => !c.archived).length ===
                    1)
              }
              onClick={() =>
                void commit(
                  (prev) => ({
                    ...prev,
                    categories: prev.categories.map((c) =>
                      c.id === category.id
                        ? { ...c, archived: !c.archived }
                        : c,
                    ),
                  }),
                  category.archived
                    ? "Categoria reativada."
                    : "Categoria arquivada.",
                )
              }
            >
              <Archive size={14} />
            </Button>
          </article>
        ))}
      </div>
    </section>

  );
}
