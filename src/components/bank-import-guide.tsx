import type { BankSource } from "@/lib/finance";
import { BANK_LABELS } from "@/lib/imports";

const guides = [
  {
    bank: "bb",
    account: "No computador, entre no internet banking e abra Conta corrente → Extratos → Conta corrente. Escolha o período e procure Salvar ou Exportar em OFX ou planilha, quando disponível.",
    accountUrl: "https://www.bb.com.br/site/pra-voce/autoatendimento-pela-internet/",
    accountLink: "Orientação do BB",
    card: "No App BB: Menu → Cartões → Extrato da fatura → três pontos → Baixar fatura. Esse caminho fornece PDF, que este app não importa. Se houver outra opção de exportação em OFX ou planilha no seu canal, use esse arquivo.",
    cardUrl: "https://www.youtube.com/watch?v=xJfeArgi0iE",
    cardLink: "Tutorial oficial do BB",
  },
  {
    bank: "itau",
    account: "No internet banking pelo computador: Ir para extrato → escolher o período → Salvar em Excel. Também pode aparecer como Conta corrente → Extrato. Use XLS ou XLSX; OFX também é aceito, se disponível.",
    accountUrl: "https://wsccontabilidade.com.br/como-exportar-o-extrato-excel-do-itau-em-2-passos/",
    accountLink: "Passo a passo do extrato",
    card: "No internet banking: Cartões → selecionar cartão → fatura atual ou anterior → Salvar a fatura → Excel, quando disponível. No app: Produtos → Cartões → Acessar fatura → Baixar fatura. Se esse download for PDF, ele não poderá ser importado aqui.",
    cardUrl: "https://www.itau.com.br/cartoes/servicos/fatura-digital",
    cardLink: "Orientação oficial do Itaú",
    extraUrl: "https://www.reclameaqui.com.br/cartoesitau/solicitacao-de-extrato-de-fatura-em-xls_itpwEvfgMgdcduDN/",
    extraLink: "Resposta do banco sobre Excel",
  },
  {
    bank: "mercado-pago",
    account: "No app: Ir ao extrato → Consultar transações → três pontos → Gerar extrato da conta → Gerar novo extrato. Escolha o período e CSV ou XLSX. No site, procure Seu dinheiro → Extrato ou Relatórios.",
    accountUrl: "https://www.mercadopago.com.br/blog/como-obter-extrato-mercado-pago",
    accountLink: "Orientação oficial do Mercado Pago",
    card: "No app, abra Cartão de Crédito e consulte a fatura do mês. A exportação da fatura em CSV ou Excel não foi confirmada. O extrato da conta e a fatura do cartão são origens diferentes; um PDF da fatura não pode ser importado aqui.",
    cardUrl: "https://www.mercadopago.com.br/blog/pagar-fatura-mercado-pago",
    cardLink: "Orientação oficial do cartão",
  },
] as const;

function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (abre em nova aba)</span></a>;
}

export function BankImportGuide({ source }: { source?: BankSource }) {
  return (
    <details className="bank-guide">
      <summary>Onde baixar meu arquivo?</summary>
      <div className="bank-guide-content">
        <p className="bank-guide-intro">Importe <strong>OFX, CSV, XLS ou XLSX de até 20 MB</strong>. Escolha uma origem separada para cada conta e cartão. Os arquivos são lidos neste navegador.</p>
        <div className="bank-guide-grid">
          {guides.map((guide) => {
            const selected = source?.bank === guide.bank;
            return (
              <article className={`bank-guide-bank${selected ? " is-selected" : ""}`} key={guide.bank} data-bank={guide.bank}>
                <h3>{BANK_LABELS[guide.bank]}</h3>
                {selected ? <span className="bank-guide-selected">Origem selecionada: {source.name}</span> : null}
                {(["account", "card"] as const).map((kind) => {
                  const active = selected && source.kind === kind;
                  return (
                    <div className={`bank-guide-kind${active ? " is-selected" : ""}`} key={kind} data-kind={kind}>
                      <h4>{kind === "account" ? "Conta bancária" : "Fatura de cartão"}</h4>
                      {active ? <span className="bank-guide-selected">Tipo da origem selecionada</span> : null}
                      <p>{guide[kind]}</p>
                      <p><GuideLink href={guide[`${kind}Url`]}>{guide[`${kind}Link`]}</GuideLink></p>
                      {kind === "card" && "extraUrl" in guide ? <p><GuideLink href={guide.extraUrl}>{guide.extraLink}</GuideLink></p> : null}
                    </div>
                  );
                })}
              </article>
            );
          })}
        </div>
        <p className="bank-guide-intro bank-guide-note"><strong>Só encontrou PDF?</strong> Cadastre as compras manualmente em Gastos, vinculando o cartão quando necessário, ou crie um CSV/Excel com as colunas Data, Descrição e Valor. Confira as colunas e o sinal dos gastos na revisão. Renomear um PDF para .csv não converte o arquivo.</p>
        <p className="field-hint bank-guide-note">Os menus e formatos podem variar por versão do aplicativo, tipo de conta e canal. Importar as compras do cartão e vincular o pagamento da fatura evita contar a mesma despesa duas vezes.</p>
      </div>
    </details>
  );
}
