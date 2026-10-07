import {
  KIND_LABELS, expensesForMonth, groupExpenses, installmentSummaries, invoiceSummary,
  monthSummary, shiftMonth, type Expense, type FinanceData,
} from "./finance";
import { debtInstallmentSummary, debtSummary } from "./debts";

/** An explanatory snapshot, never a restore document or a second ledger. */
export function financialReport(data: FinanceData, selectedMonth: string, today: string) {
  const invoices = new Map<string, ReturnType<typeof invoiceSummary>>();
  const invoiceFor = (cardId: string, month: string) => {
    const key = `${cardId}:${month}`;
    if (!invoices.has(key)) invoices.set(key, invoiceSummary(data, cardId, month));
    return invoices.get(key)!;
  };
  const cardName = (id: string | null) => data.cards.find((card) => card.id === id)?.name ?? null;
  const debtName = (id: string | null) => data.debts.find((debt) => debt.id === id)?.name ?? null;
  const expense = (item: Expense) => ({
    descricao: item.description, valor_centavos: item.amountCents, categoria: item.category,
    data_contabilizacao: item.date, data_compra: item.purchaseDate,
    vencimento_combinado: item.dueDate, situacao: item.status === "paid" ? "Pago" : "Previsto",
    tipo: KIND_LABELS[item.kind], cartao: cardName(item.cardId), divida: debtName(item.debtId),
    parcela: item.installmentNumber, total_parcelas: item.installmentCount,
  });
  const monthly = (month: string) => {
    const summary = monthSummary(data, month);
    const items = expensesForMonth(data, month);
    return {
      mes: month, salario_centavos: summary.salary, gastos_centavos: summary.total,
      pagos_centavos: summary.paid, previstos_centavos: summary.planned,
      sobra_propria_centavos: summary.ownRemaining, sobra_recebida_centavos: summary.received,
      sobra_prevista_centavos: summary.remaining, sobra_transferida_centavos: summary.transferred,
      quantidade_gastos: items.length,
      por_categoria: groupExpenses(items, "category").map((group) => ({ categoria: group.name, valor_centavos: group.value })),
      gastos: items.map(expense),
      faturas: data.cards.flatMap((card) => {
        const invoice = invoiceFor(card.id, month);
        if (!invoice.items.length) return [];
        return [{ cartao: card.name, vencimento: invoice.dueDate, paga: invoice.paid,
          total_centavos: invoice.total, compras_centavos: invoice.singleTotal,
          parcelas_centavos: invoice.installmentTotal, quantidade_compras: invoice.items.length }];
      }),
    };
  };
  const projections = Array.from({ length: 6 }, (_, index) => shiftMonth(selectedMonth, index + 1))
    .filter((month) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month));
  const knownMonths = new Set([
    ...Object.keys(data.salaries), ...data.expenses.map((item) => item.date.slice(0, 7)),
    ...data.invoices.map((invoice) => invoice.month), ...data.recurrences.map((rule) => rule.startMonth),
    ...Object.keys(data.balanceTransfers).flatMap((month) => [month, shiftMonth(month, 1)]), selectedMonth,
  ]);
  return {
    tipo: "relatorio_financeiro_para_ia", versao_relatorio: 1,
    contexto: {
      aplicativo: "mês.", idioma: "pt-BR", moeda: "BRL", unidade_monetaria: "centavos inteiros; 100 centavos = R$ 1,00",
      gerado_em: today, mes_selecionado: selectedMonth,
      finalidade: "Analisar os dados cadastrados e sugerir melhorias no planejamento financeiro pessoal.",
      regras: [
        "Gastos mensais incluem valores pagos e previstos. Faturas resumem compras já incluídas nos gastos; não some as faturas novamente.",
        "O mês do cartão é o mês da fatura. A data da compra pode ser diferente da data de contabilização.",
        "Salário null significa não informado; zero significa salário informado igual a zero. Sem salário, a sobra prevista é null.",
        "Sobra própria = salário - gastos. Sobra prevista = sobra própria + sobra recebida do mês anterior.",
        "Transferências de sobra são opcionais, confirmadas e de valor fixo; não são novas receitas, despesas ou pagamentos.",
        "Histórico anterior de compras parceladas não comprova pagamentos registrados. A posição da parcela não é a quantidade paga.",
        "Entrada e histórico de dívidas reduzem o saldo, mas não representam despesas mensais retroativas.",
        "Parcelas previstas de dívidas ainda não amortizam o saldo. Pagamentos registrados aparecem nos gastos mensais.",
        "Recorrências são materializadas em cada mês consultado. Não some o cadastro da recorrência aos seus gastos mensais.",
        "Compromissos e projeções consideram somente cadastros existentes, não incluem gastos desconhecidos nem repetem salários automaticamente.",
        "A projeção pode repetir meses já listados em meses_cadastrados. Compare as duas visões; não some seus totais entre si.",
        "Não há saldo bancário verificado, contabilização de estornos ou cálculo de juros. Os dados podem estar incompletos.",
      ],
    },
    meses_cadastrados: [...knownMonths].sort().map(monthly),
    projecao_seis_meses: projections.map(monthly),
    compromissos_futuros_cadastrados: data.expenses.map((item) => item.cardId
      ? { ...item, status: invoiceFor(item.cardId, item.date.slice(0, 7)).paid ? "paid" as const : "planned" as const }
      : item).filter((item) => item.status === "planned" && item.date.slice(0, 7) > selectedMonth).map(expense),
    transferencias_de_sobra: Object.entries(data.balanceTransfers).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ mes_origem: month, mes_destino: shiftMonth(month, 1), valor_centavos: amount })),
    cartoes: data.cards.map((card) => ({ nome: card.name, dia_fechamento: card.closingDay, dia_vencimento: card.dueDay })),
    categorias: data.categories.map((category) => ({ nome: category.name, arquivada: category.archived })),
    recorrencias: data.recurrences.map((rule) => ({ descricao: rule.description, valor_centavos: rule.amountCents,
      categoria: rule.category, cartao: cardName(rule.cardId), mes_inicio: rule.startMonth,
      mes_fim: rule.endMonth, dia: rule.day, meses_ignorados: rule.skippedMonths })),
    compras_parceladas: installmentSummaries(data, selectedMonth).map((plan) => ({
      descricao: plan.description, total_parcelas: plan.totalInstallments, primeira_parcela_cadastrada: plan.firstInstallment,
      anteriores_historico_informado: plan.firstInstallment - 1, mes_inicio_acompanhamento: plan.firstMonth,
      parcela_no_mes: plan.current?.installmentNumber ?? null, posicao_calendario: plan.position,
      parcelas_pagas_registradas: plan.paidCount, parcelas_pendentes: plan.pendingCount,
      saldo_pendente_centavos: plan.remaining, mes_termino: plan.lastMonth, parcelas_cadastradas: plan.items.map(expense),
    })),
    dividas: data.debts.map((debt) => {
      const summary = debtSummary(data, debt, today);
      const schedule = debt.type === "installment" ? debtInstallmentSummary(data, debt) : null;
      return {
        nome: debt.name, credor: debt.creditor, descricao: debt.description, categoria: debt.category,
        tipo: { fixed: "Valor fixo", itemized: "Por custos", installment: "Parcelamento combinado" }[debt.type],
        mes_inicio_acompanhamento: debt.startMonth, valor_original_centavos: debt.originalCents,
        entrada_centavos: debt.downPaymentCents, historico_pago_centavos: debt.historicalPaidCents,
        total_amortizado_centavos: summary.amortized, saldo_devedor_centavos: summary.remaining,
        media_pagamentos_centavos: summary.averageCents, meses_da_media: summary.months,
        previsao_quitacao_por_media: schedule ? null : summary.endMonth,
        custos: debt.costs.map((cost) => ({ descricao: cost.description, valor_centavos: cost.amountCents })),
        pagamentos_registrados: summary.payments.map(expense),
        combinado: schedule ? { total_parcelas: schedule.plan.totalInstallments,
          parcelas_anteriores_historico: schedule.historicalCount, proximo_vencimento: schedule.nextDueDate,
          ultimo_vencimento: schedule.lastDueDate, parcelas: schedule.items.map(expense) } : null,
      };
    }),
  };
}
