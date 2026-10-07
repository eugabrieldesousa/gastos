"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard as CardIcon,
  Download,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { ThemeMenu } from "@/components/theme-menu";
import { AccountMenu, type FinanceAccount } from "@/components/account-menu";
import { SalaryDialog } from "@/components/finance-dialogs";
import {
  CardEditor,
  CategoryEditor,
  ExpenseEditor,
  NativeSelect,
} from "@/components/finance-editor";
import { CategoryMark, ExpenseList } from "@/components/expense-list";
import { FinanceChart } from "@/components/finance-chart";
import { useFinance } from "@/hooks/use-finance";
import { saveDebtPayment, setDebtInstallmentPayment } from "@/lib/debts";
const DebtInstallmentPaymentEditor = dynamic(() => import("@/components/debt-installment-payment-editor").then((module) => module.DebtInstallmentPaymentEditor));
const DebtsPanel = dynamic(() => import("@/components/debts-panel").then((module) => module.DebtsPanel));
const ImportsPanel = dynamic(() => import("@/components/imports-panel").then((module) => module.ImportsPanel));
import {
  KIND_LABELS,
  addExpense,
  dateLabel,
  editOccurrence,
  ensureInvoice,
  expensesForMonth,
  formatMoney,
  groupExpenses,
  installmentSummaries,
  invoiceSummary,
  monthLabel,
  monthSummary,
  parseBackup,
  removeOccurrence,
  saveCard,
  saveCategory,
  saveExpense,
  setInvoicePaid,
  shiftMonth,
  type Category,
  type CreditCard,
  type Expense,
  type ExpenseFilter,
  type FinanceData,
  type NewExpense,
} from "@/lib/finance";

const pages = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "expenses", label: "Gastos", icon: Wallet },
  { id: "cards", label: "Cartões e faturas", icon: CardIcon },
  { id: "installments", label: "Parcelamentos", icon: Repeat2 },
  { id: "debts", label: "Dívidas", icon: Banknote },
  { id: "imports", label: "Importações", icon: Upload },
  { id: "categories", label: "Categorias", icon: Tags },
] as const;
type PageName = (typeof pages)[number]["id"];

export function Dashboard({ account, cloudEnabled = false, historyUrl }: { account?: FinanceAccount; cloudEnabled?: boolean; historyUrl?: string }) {
  const finance = useFinance(account?.id);
  const { data, loading, ready, busy, error, today } = finance;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [page, setPage] = useState<PageName>("overview");
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [search, setSearch] = useState("");
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<{
    expense: Expense | null;
    cardId?: string;
  } | null>(null);
  const [installmentPayment, setInstallmentPayment] = useState<Expense | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    category: Category | null;
  } | null>(null);
  const [cardForm, setCardForm] = useState<{ card: CreditCard | null } | null>(
    null,
  );
  const [selectedCard, setSelectedCard] = useState("");
  const [expandedPlan, setExpandedPlan] = useState("");
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteScope, setDeleteScope] = useState<"one" | "future">("one");
  const [backup, setBackup] = useState<{
    data: FinanceData;
    filename: string;
  } | null>(null);
  const [readingBackup, setReadingBackup] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupButton = useRef<HTMLButtonElement>(null);
  const month = selectedMonth ?? today.slice(0, 7);
  const disabled = !ready || busy;
  const allExpenses = useMemo(
    () => expensesForMonth(data, month),
    [data, month],
  );
  const summary = useMemo(() => monthSummary(data, month), [data, month]);
  const categoryGroups = useMemo(
    () => groupExpenses(allExpenses, "category"),
    [allExpenses],
  );
  const kindGroups = useMemo(
    () => groupExpenses(allExpenses, "kind"),
    [allExpenses],
  );
  const filtered = allExpenses.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (!categoryFilter || e.category === categoryFilter) &&
      (!kindFilter || e.kind === kindFilter) &&
      e.description
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const card = data.cards.find((c) => c.id === selectedCard) ?? data.cards[0];
  const invoice = card && month ? invoiceSummary(data, card.id, month) : null;
  const plans = useMemo(() => installmentSummaries(data, month), [data, month]);
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

  function clearFilters() {
    setFilter("all");
    setCategoryFilter("");
    setKindFilter("");
    setSearch("");
  }
  function changeMonth(value: string) {
    setSelectedMonth(value);
    clearFilters();
  }
  function openExpense(expense: Expense | null = null, cardId?: string) {
    setReturnFocus(
      expense
        ? document.querySelector<HTMLElement>(
            `button[data-expense-id="${expense.id}"]`,
          )
        : (document.activeElement as HTMLElement),
    );
    if (expense?.kind === "installment" && expense.debtId) { setInstallmentPayment(expense); return; }
    setExpenseForm({ expense, cardId });
  }
  function selectCategory(name: string) {
    clearFilters();
    setCategoryFilter(name);
    setPage("expenses");
  }
  function selectKind(kind: string) {
    clearFilters();
    setKindFilter(kind);
    setPage("expenses");
  }
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mes-backup-${today}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Backup exportado.");
  }
  async function readBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReadingBackup(true);
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("O backup deve ter no máximo 100 MB.");
      setBackup({ data: parseBackup(await file.text()), filename: file.name });
      setReturnFocus(backupButton.current);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o backup.",
      );
    } finally {
      setReadingBackup(false);
    }
  }
  const listProps = {
    categories: data.categories,
    disabled,
    onAdd: () => openExpense(),
    onEdit: (expense: Expense) => openExpense(expense),
    onDelete: (expense: Expense) => {
      setReturnFocus(document.activeElement as HTMLElement);
      setDeleteScope("one");
      setDeleting(expense);
    },
    onToggle: (expense: Expense) => {
      if (expense.kind === "installment" && expense.debtId) {
        if (expense.status === "planned") openExpense(expense);
        else void finance.commit((prev) => setDebtInstallmentPayment(prev, expense.id, null, today), "Pagamento desfeito.");
        return;
      }
      void finance.commit(
        (prev) =>
          saveExpense(
            prev,
            {
              ...expense,
              status: expense.status === "paid" ? "planned" : "paid",
            },
            expense.id,
          ),
        "Situação atualizada.",
      );
    },
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="shell-container header-content">
          <Link href="/" aria-label="mês. — Início" className="brand">
            <span className="brand-icon">
              <Leaf size={19} />
            </span>
            <span>
              mês<span className="text-primary">.</span>
            </span>
          </Link>
          <span className="header-tagline">Seu dinheiro, com clareza.</span>
          <div className="header-actions">
            <ThemeMenu />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={backupButton}
                  variant="outline"
                  className="backup-button"
                  disabled={loading || busy || readingBackup}
                >
                  {readingBackup ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Backup
                  <ChevronDown size={13} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!ready} onSelect={exportBackup}>
                  <Download />
                  Exportar backup
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                  <Upload />
                  Restaurar backup
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AccountMenu account={account} enabled={cloudEnabled} busy={busy} canTransfer={ready && data.revision === 0 && finance.localAvailable} reload={finance.reload} transfer={finance.transferLocal} historyUrl={historyUrl} />
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Arquivo de backup"
            onChange={readBackup}
          />
        </div>
      </header>
      <main className="shell-container workspace">
        <div className="workspace-toolbar">
          <div>
            <span className="eyebrow">SEU CONTROLE FINANCEIRO</span>
            <h1>{pages.find((p) => p.id === page)?.label}</h1>
          </div>
          <div className="toolbar-actions">
            <div className="month-navigation">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mês anterior"
                disabled={loading || month <= "1000-01"}
                onClick={() => changeMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={16} />
              </Button>
              <label className="month-selector">
                <span data-testid="selected-month">
                  {month ? monthLabel(month) : "Carregando…"}
                </span>
                <input
                  type="month"
                  aria-label="Selecionar mês"
                  value={month}
                  min="1000-01"
                  max="9999-12"
                  disabled={loading}
                  onChange={(e) => {
                    if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.target.value))
                      changeMonth(e.target.value);
                  }}
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Próximo mês"
                disabled={loading || month >= "9999-12"}
                onClick={() => changeMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
            {month && month !== today.slice(0, 7) ? (
              <Button
                variant="ghost"
                size="sm"
                className="today-button"
                onClick={() => changeMonth(today.slice(0, 7))}
              >
                Ir para hoje
              </Button>
            ) : null}
            <Button
              data-add-expense
              onClick={() => openExpense()}
              disabled={disabled}
            >
              <Plus size={16} />
              Adicionar gasto
            </Button>
          </div>
        </div>
        {error ? (
          <Alert variant="destructive" className="workspace-error">
            <AlertTitle>Seus dados precisam de atenção</AlertTitle>
            <AlertDescription>
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void finance.reload()}
                disabled={busy}
              >
                <RefreshCw size={14} />
                Recarregar dados
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <section
          className="summary-grid"
          aria-label="Resumo do mês"
          aria-busy={loading}
        >
          <div className="summary-card">
            <div className="summary-label">
              <span>Salário do mês</span>
              <Banknote size={16} />
            </div>
            <strong className="summary-value" data-testid="salary-total">
              {loading
                ? "—"
                : summary.salary === null
                  ? "Não informado"
                  : formatMoney(summary.salary)}
            </strong>
            <Button
              className="salary-edit"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setReturnFocus(document.activeElement as HTMLElement);
                setSalaryOpen(true);
              }}
            >
              <Pencil size={11} />
              {summary.salary === null ? "Informar salário" : "Editar salário"}
            </Button>
          </div>
          <div className="summary-card">
            <div className="summary-label">
              <span>Total do mês</span>
              <ArrowUpRight size={16} />
            </div>
            <strong className="summary-value" data-testid="month-total">
              {formatMoney(summary.total)}
            </strong>
            <span className="summary-caption">
              Pagos:{" "}
              <span data-testid="paid-total">{formatMoney(summary.paid)}</span>
            </span>
          </div>
          <div className="summary-card">
            <div className="summary-label">
              <span>A pagar</span>
              <Clock3 size={16} />
            </div>
            <strong className="summary-value" data-testid="planned-total">
              {formatMoney(summary.planned)}
            </strong>
            <span className="summary-caption">Contas e faturas pendentes</span>
          </div>
          <div
            className={`summary-card remaining-card ${summary.remaining !== null && summary.remaining < 0 ? "remaining-negative" : ""}`}
          >
            <div className="summary-label">
              <span>Sobra prevista</span>
              <ArrowDownLeft size={16} />
            </div>
            <strong className="summary-value" data-testid="remaining-total">
              {summary.remaining === null
                ? "—"
                : formatMoney(summary.remaining)}
            </strong>
            <span className="summary-caption">
              {summary.remaining === null
                ? "Informe o salário para calcular"
                : summary.remaining < 0
                  ? "Os gastos ultrapassam o salário"
                  : "Depois de todos os gastos"}
            </span>
          </div>
        </section>
        <nav className="workspace-navigation" aria-label="Seções do sistema">
          {pages.map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div
          className={`workspace-content ${page === "overview" ? "overview-content" : ""}`}
          aria-busy={loading}
        >
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="animate-spin" />
              Carregando seus dados…
            </div>
          ) : !ready ? (
            <div className="empty-state">
              <ShieldCheck />
              <h2>Vamos recuperar seus dados</h2>
              <p>
                Recarregue os dados ou restaure um backup pelo menu no topo.
              </p>
            </div>
          ) : page === "overview" ? (
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
                        single: "#31745b",
                        fixed: "#608fbc",
                        installment: "#d19845",
                        debt: "#8d79b5",
                      }[g.name as Expense["kind"]],
                    }))}
                    onSelect={selectKind}
                  />
                </div>
                <section className="panel expense-panel">
                  <div className="panel-heading">
                    <h2>
                      Seus gastos{" "}
                      <span className="expense-count">
                        {allExpenses.length}
                      </span>
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearFilters();
                        setPage("expenses");
                      }}
                    >
                      Ver todos
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                  <div className="panel-scroll">
                    <ExpenseList
                      {...listProps}
                      expenses={allExpenses}
                      hasExpenses={allExpenses.length > 0}
                    />
                  </div>
                  <div className="panel-footer">
                    <span>{allExpenses.length} gastos neste mês</span>
                    <strong>{formatMoney(summary.total)}</strong>
                  </div>
                </section>
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
                    className="insights-body"
                    tabIndex={0}
                    role="region"
                    aria-label="Detalhes da análise do mês"
                  >
                    <div className="salary-insight">
                      <strong>
                        {summary.salary !== null && summary.salary > 0
                          ? `${Math.round((summary.total / summary.salary) * 100)}%`
                          : "—"}
                      </strong>
                      <span>
                        {summary.salary === null
                          ? "Informe o salário para analisar o comprometimento."
                          : summary.salary === 0
                            ? "Salário zero: os gastos são exibidos na sobra prevista."
                            : "do salário comprometido"}
                      </span>
                    </div>
                    <div className="commitment-track">
                      <span
                        style={{
                          width: `${summary.salary && summary.salary > 0 ? Math.min(100, (summary.total / summary.salary) * 100) : 0}%`,
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
                            changeMonth(item.month);
                            if (item.cardId) {
                              setSelectedCard(item.cardId);
                              setPage("cards");
                            } else {
                              setPage("expenses");
                              setFilter("planned");
                            }
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
                        onClick={() => changeMonth(item.month)}
                      >
                        <span>{monthLabel(item.month)}</span>
                        <strong>{formatMoney(item.summary.total)}</strong>
                      </button>
                    ))}
                  </div>
                  <p className="forecast-hint">
                    Compromissos cadastrados; valores podem mudar.
                  </p>
                </section>
              </aside>
            </>
          ) : page === "expenses" ? (
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
                <ExpenseList
                  {...listProps}
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
          ) : page === "cards" ? (
            <div className="cards-layout">
              <section className="panel cards-list">
                <div className="panel-heading">
                  <h2>Seus cartões</h2>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Novo cartão"
                    disabled={disabled}
                    onClick={() => setCardForm({ card: null })}
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
                  onClick={() => setCardForm({ card: null })}
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
                      onClick={() => setCardForm({ card })}
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
                        className={`expense-status ${invoice.paid ? "is-paid" : "is-planned"}`}
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
                          void finance.commit(
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
                            void finance.commit(
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
                    onClick={() => setCardForm({ card: null })}
                    disabled={disabled}
                  >
                    Cadastrar cartão
                  </Button>
                </section>
              )}
            </div>
          ) : page === "installments" ? (
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
                      <div className="installment-progress">
                        <span
                          style={{
                            width: `${(plan.paidCount / Math.max(plan.items.length, 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="installment-meta">
                        <span>
                          {plan.paidCount} quitadas · {plan.pendingCount}{" "}
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
          ) : page === "debts" ? (
            <DebtsPanel data={data} today={today} busy={busy} disabled={disabled} saveError={error} commit={finance.commit} />
          ) : page === "imports" ? (
            <ImportsPanel data={data} today={today} busy={busy} disabled={disabled} saveError={error} commit={finance.commit} />
          ) : (
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
                  onClick={() => setCategoryForm({ category: null })}
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
                      onClick={() => setCategoryForm({ category })}
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
                        void finance.commit(
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
          )}
        </div>
        <footer className="workspace-footer">
          <span>
            <ShieldCheck size={12} />
            {account ? (busy ? "Salvando no GitHub…" : error ? "Sincronização pendente" : loading ? "Carregando sua conta…" : "Salvo no GitHub") : "Salvo neste navegador"}
          </span>
          <span>Um mês de cada vez.</span>
        </footer>
      </main>
      {salaryOpen && month ? (
        <SalaryDialog
          month={month}
          salary={summary.salary}
          busy={busy}
          returnFocus={returnFocus}
          onClose={() => setSalaryOpen(false)}
          onSave={(cents) =>
            finance.commit(
              (prev) => ({
                ...prev,
                salaries: { ...prev.salaries, [month]: cents },
              }),
              "Salário atualizado.",
            )
          }
        />
      ) : null}
      {installmentPayment && data.debts.find((d) => d.id === installmentPayment.debtId) ? <DebtInstallmentPaymentEditor
        data={data} debt={data.debts.find((d) => d.id === installmentPayment.debtId)!} today={today} installment={installmentPayment}
        busy={busy} saveError={error} returnFocus={returnFocus} onClose={() => setInstallmentPayment(null)}
        onSave={async (id, date) => {
          const saved = await finance.commit((prev) => setDebtInstallmentPayment(prev, id, date, today), "Parcela paga.");
          if (saved && date.slice(0, 7) !== month) changeMonth(date.slice(0, 7));
          return saved;
        }} /> : null}
      {expenseForm ? (
        <ExpenseEditor
          saveError={error}
          data={data}
          month={expenseForm.expense?.date.slice(0, 7) ?? month}
          today={today}
          expense={expenseForm.expense}
          initialCardId={expenseForm.cardId}
          busy={busy}
          returnFocus={returnFocus}
          onNewCategory={() => setCategoryForm({ category: null })}
          onClose={() => setExpenseForm(null)}
          onSave={async (input, expense, scope) => {
            const editInput = {
              description: input.description,
              amountCents: input.amountCents,
              category: input.category,
              date: input.date,
              status: input.status,
              purchaseDate: input.purchaseDate,
            };
            const saved = await finance.commit(
              (prev) =>
                input.kind === "debt"
                  ? saveDebtPayment(prev, input.debtId ?? "", editInput, expense?.id, today)
                  : expense
                  ? editOccurrence(prev, expense, editInput, scope)
                  : addExpense(prev, input as NewExpense),
              expense ? "Gasto atualizado." : "Gasto adicionado.",
            );
            if (saved && input.date.slice(0, 7) !== month)
              changeMonth(input.date.slice(0, 7));
            return saved;
          }}
        />
      ) : null}
      {categoryForm ? (
        <CategoryEditor
          saveError={error}
          category={categoryForm.category}
          busy={busy}
          onClose={() => setCategoryForm(null)}
          onSave={(input, id) =>
            finance.commit(
              (prev) => saveCategory(prev, input, id),
              "Categoria salva.",
            )
          }
        />
      ) : null}
      {cardForm ? (
        <CardEditor
          saveError={error}
          card={cardForm.card}
          busy={busy}
          onClose={() => setCardForm(null)}
          onSave={(input, id) =>
            finance.commit((prev) => saveCard(prev, input, id), "Cartão salvo.")
          }
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLElement>("[data-add-expense]")?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.kind === "fixed"
                ? "Excluir ou encerrar recorrência?"
                : "Excluir gasto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Você está removendo “${deleting.description}”. Confira o alcance da exclusão.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting?.seriesId ? (
            <NativeSelect
              aria-label="Alcance da exclusão"
              value={deleteScope}
              onChange={(e) =>
                setDeleteScope(e.target.value as "one" | "future")
              }
            >
              <option value="one">Somente esta ocorrência</option>
              <option value="future">Esta e as seguintes</option>
            </NativeSelect>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-[var(--destructive-foreground)] hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (
                  deleting &&
                  (await finance.commit(
                    (prev) => removeOccurrence(prev, deleting, deleteScope),
                    "Gasto removido.",
                  ))
                )
                  setDeleting(null);
              }}
            >
              Excluir gasto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(backup)}
        onOpenChange={(open) => {
          if (!open && !busy) setBackup(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            backupButton.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar dados?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo {backup?.filename} substituirá todos os registros
              atuais. Exporte um backup antes se quiser preservá-los.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                if (backup && (await finance.restore(backup.data))) {
                  setBackup(null);
                  clearFilters();
                  setSelectedCard("");
                }
              }}
            >
              Restaurar dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
