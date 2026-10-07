"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
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
  ShieldCheck,
  Sparkles,
  Tags,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { BalanceTransferDialog, SalaryDialog } from "@/components/finance-dialogs";
import { financialReport } from "@/lib/finance-report";
import {
  CardEditor,
  CategoryEditor,
  ExpenseEditor,
  NativeSelect,
} from "@/components/finance-editor";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { ExpensesPanel } from "@/components/expenses-panel";
import { CardsPanel } from "@/components/cards-panel";
import { InstallmentsPanel } from "@/components/installments-panel";
import { CategoriesPanel } from "@/components/categories-panel";
import { useFinance } from "@/hooks/use-finance";
import { saveDebtPayment, setDebtInstallmentPayment } from "@/lib/debts";
const DebtInstallmentPaymentEditor = dynamic(() => import("@/components/debt-installment-payment-editor").then((module) => module.DebtInstallmentPaymentEditor));
const DebtsPanel = dynamic(() => import("@/components/debts-panel").then((module) => module.DebtsPanel));
const ImportsPanel = dynamic(() => import("@/components/imports-panel").then((module) => module.ImportsPanel));
import {
  addExpense,
  editOccurrence,
  expensesForMonth,
  formatMoney,
  monthLabel,
  monthSummary,
  parseBackup,
  removeOccurrence,
  saveCard,
  saveCategory,
  saveExpense,
  saveBalanceTransfer,
  shiftMonth,
  type Category,
  type CreditCard,
  type Expense,
  type ExpenseFilter,
  type FinanceData,
  type NewExpense,
} from "@/lib/finance";

const pages = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
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
  const [page, setPage] = useState<PageName>("expenses");
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [transferMonth, setTransferMonth] = useState<string | null>(null);
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

  function clearFilters() {
    setFilter("all");
    setCategoryFilter("");
    setKindFilter("");
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
  function downloadJson(value: unknown, filename: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportBackup() {
    downloadJson(data, `mes-backup-${today}.json`);
    toast.success("Backup exportado.");
  }
  function exportReport() {
    downloadJson(financialReport(data, month, today), `mes-relatorio-ia-${today}.json`);
    toast.success("Relatório para IA exportado.");
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
    today,
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
                <DropdownMenuItem disabled={!ready} onSelect={exportReport}>
                  <Sparkles />
                  Exportar relatório para IA
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
                  ? "Os gastos ultrapassam o saldo disponível"
                  : "Depois de todos os gastos"}
            </span>
            {summary.received > 0 && <span className="summary-caption carryover-caption" data-testid="received-balance">
              {summary.salary === null ? "Sobra recebida: " : "Inclui "}{formatMoney(summary.received)} de sobra de {monthLabel(shiftMonth(month, -1))}.{" "}
              {summary.ownRemaining !== null && <span>Resultado deste mês: {formatMoney(summary.ownRemaining)}.</span>}
            </span>}
            {summary.transferred > 0 && <span className="summary-caption" data-testid="transferred-balance">
              {formatMoney(summary.transferred)} levados para {monthLabel(shiftMonth(month, 1))}.
            </span>}
            {month && month <= today.slice(0, 7) && month < "9999-12" && (summary.transferred > 0 || (summary.remaining !== null && summary.remaining > 0)) && <Button
              className="salary-edit transfer-button" variant="ghost" size="sm" disabled={disabled}
              onClick={() => { setReturnFocus(document.activeElement as HTMLElement); setTransferMonth(month); }}>
              <ArrowUpRight size={13} />{summary.transferred > 0 ? "Editar transferência de sobra" : month === today.slice(0, 7) ? "Simular próximo mês" : "Levar sobra para o próximo mês"}
            </Button>}
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
            <AnalyticsPanel data={data} month={month} today={today} onMonthChange={changeMonth} selectCategory={selectCategory} selectKind={selectKind} onOpenUpcoming={(cardId) => { if (cardId) {setSelectedCard(cardId); setPage("cards");} else {setFilter("planned"); setPage("expenses");} }} />
          ) : page === "expenses" ? (
            <ExpensesPanel key={`${month}:${filter}:${categoryFilter}:${kindFilter}`} data={data} month={month} allExpenses={allExpenses} listProps={listProps} initialFilter={filter} initialCategory={categoryFilter} initialKind={kindFilter} />
          ) : page === "cards" ? (
            <CardsPanel data={data} month={month} today={today} disabled={disabled} selectedCard={selectedCard} setSelectedCard={setSelectedCard} onEditCard={(card) => setCardForm({card})} openExpense={openExpense} commit={finance.commit} listProps={listProps} />
          ) : page === "installments" ? (
            <InstallmentsPanel data={data} month={month} listProps={listProps} openExpense={() => openExpense()} />
          ) : page === "debts" ? (
            <DebtsPanel data={data} today={today} busy={busy} disabled={disabled} saveError={error} commit={finance.commit} />
          ) : page === "imports" ? (
            <ImportsPanel data={data} today={today} busy={busy} disabled={disabled} saveError={error} commit={finance.commit} />
          ) : (
            <CategoriesPanel data={data} allExpenses={allExpenses} disabled={disabled} onEditCategory={(category) => setCategoryForm({category})} commit={finance.commit} />
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
      {transferMonth && <BalanceTransferDialog key={transferMonth} month={transferMonth}
        available={monthSummary(data, transferMonth).remaining} existing={data.balanceTransfers[transferMonth] ?? 0}
        nextSummary={monthSummary(data, shiftMonth(transferMonth, 1))}
        busy={busy} returnFocus={returnFocus} onClose={() => setTransferMonth(null)}
        onSave={(amount) => finance.commit((previous) => saveBalanceTransfer(previous, transferMonth, amount, today),
          amount === null ? "Transferência removida." : "Sobra confirmada para o próximo mês.")} />}
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
