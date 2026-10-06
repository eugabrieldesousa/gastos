# mês. — Controle de gastos

Painel financeiro pessoal para acompanhar salário, gastos avulsos, contas fixas, faturas de cartão e compras parceladas. Construído com Next.js App Router, TypeScript, Tailwind CSS e componentes shadcn/ui (Radix). A interface fica na viewport, com rolagem dentro das áreas de conteúdo.

## Executar

Requisitos: Node.js LTS (24 recomendado), npm e Git. Após instalar ou preparar as ferramentas, reabra o terminal para atualizar o PATH.

```powershell
npm install
npm run dev
```

Acesse **http://127.0.0.1:3000**. Não são necessárias variáveis de ambiente, conta ou serviços externos.

## Uso

- Navegue entre meses pelas setas ou pelo seletor de mês e informe o salário líquido.
- **Visão geral:** distribuição por categoria e tipo, vencimentos, comprometimento do salário, comparação mensal e compromissos dos próximos seis meses. Clique nos gráficos ou nas legendas para filtrar os gastos.
- **Gastos:** cadastre valores em reais (ex.: `1.234,56`) e filtre por descrição, categoria, tipo e situação. Gastos fora do cartão pertencem ao mês da data informada.
- **Fixos:** informe início e término opcional. Os outros meses são previstos sem duplicar dados; edite uma ocorrência ou as futuras, ou encerre a recorrência pelo menu de ações. O pagamento de uma ocorrência não paga os próximos meses.
- **Cartões e faturas:** cadastre nome, fechamento e vencimento. Confira a fatura sugerida pela data da compra; o mês pode ser corrigido manualmente. A data do fechamento inicia o próximo ciclo, e o vencimento vem após o fechamento. Dias inexistentes usam o último dia do mês.
- As faturas separam compras em uma vez e parcelas. Quite a fatura inteira ou desfaça a quitação. Para alterar seus itens, desfaça a quitação primeiro. O pagamento altera a situação dos gastos, sem adicionar uma nova despesa.
- **Parcelamentos:** para compras novas, informe o valor total e a quantidade de parcelas. Para compras em andamento, informe o valor de cada parcela e a parcela inicial (ex.: 4 de 10). As anteriores são histórico informado, sem pagamentos inventados. Acompanhe quitadas, pendentes, saldo e término.
- **Categorias:** crie categorias com nome, cor e ícone; renomeie, arquive ou reative. O histórico é preservado. As categorias incluem Carro, Trabalho, Lazer, Música, Telefonia e internet e Assinaturas.
- **Dívidas:** cadastre o valor original, credor, entrada, total pago depois da entrada e mês inicial do acompanhamento. Entrada e histórico reduzem o saldo sem gerar gastos retroativos. Registre pagamentos variáveis ou vincule um gasto direto já existente. O saldo, progresso e histórico acompanham edições e exclusões. A média dos últimos três meses completos inclui meses sem pagamento como zero, exclui o mês atual e o histórico sem datas, e estima a quitação a partir do próximo mês. Sem média positiva, a previsão fica indisponível. A previsão não cria gastos futuros; dívidas são sem juros.
- **Importações:** crie uma origem para cada conta ou cartão do BB, Mercado Pago ou Itaú e selecione um extrato OFX, CSV, XLS ou XLSX de até 20 MB. Nas planilhas, confira a aba, cabeçalho, colunas e sinal dos gastos. Esse mapeamento é salvo por origem. A importação não exige senhas, servidor ou serviços externos; os arquivos são processados no navegador.
- Revise cada linha: crie um gasto, vincule uma ocorrência existente, registre pagamento de dívida, vincule pagamento integral de fatura ou ignore a movimentação. No cartão, confirme o mês de vencimento e os dados de parcelamentos antes de criar as parcelas restantes. O extrato da conta não deve cadastrar o pagamento de fatura como outra despesa.
- Identificadores bancários são únicos por origem; sem identificador, o mesmo arquivo é reconhecido pelo conteúdo e pela linha, mesmo após renomear. Arquivos sobrepostos geram avisos de possível duplicidade: vincule o gasto ou confirme outra transação legítima. Editar ou excluir um gasto mantém a identidade importada. Linhas ignoradas podem ser revistas ao importar o arquivo novamente; “Deixar sem alterar” mantém a linha pendente. O lote inteiro é salvo de uma vez e uma revisão desatualizada precisa ser refeita.
- Importação aceita somente reais. PDF, fotos, receitas e contabilização de estornos ficam fora desta versão. Entradas, estornos e transferências próprias reconhecidas ficam visíveis para revisão sem virarem gastos. Layouts bancários variam; use o mapeamento de colunas conforme o arquivo exportado. Arquivos originais não entram no backup, somente os dados normalizados e a rastreabilidade.
- A sobra é o salário menos todos os gastos pagos e previstos. Sem salário informado, ela fica sem cálculo; salário zero é válido.
- No menu **Backup**, exporte todos os meses ou restaure um arquivo JSON. A restauração exige confirmação e substitui todos os dados atuais.

Os dados ficam no `localStorage` do navegador, na chave `mes.finance.v1`. São exclusivos daquele navegador e endereço; mudar de porta ou domínio cria outro armazenamento. Limpar os dados do navegador também remove os registros. Use os backups para guardar ou transportar os lançamentos.

O documento e os backups usam a versão **3**. A chave antiga foi mantida para encontrar os registros existentes. A leitura e a restauração migram as versões 1 e 2 sem alterar valores, datas, salários, categorias, parcelas ou situações; a próxima gravação salva a versão 3. Os backups incluem dívidas, origens e registros de importação. Backups inválidos não substituem os dados atuais.

## Verificar

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Se outra versão do app já estiver na porta 3000, use uma porta livre para os testes: no PowerShell, execute `$env:PLAYWRIGHT_PORT = '3001'` antes de `npm run test:e2e`.

Os testes unitários cobrem cálculos, valores brasileiros, datas, migração, categorias, recorrências, distribuição de centavos, parcelas em andamento, quitação de faturas, dívidas, leitura de OFX/CSV/XLS/XLSX, duplicidades, lotes e falhas no armazenamento. Os testes de navegador cobrem os fluxos completos em desktop e celular, além de listas extensas em 1366×768 e 1440×900; iniciam um servidor local se necessário.

## Organização

- `src/lib/finance.ts`: tipos, validações e cálculos independentes da interface.
- `src/lib/repository.ts`: contrato assíncrono de armazenamento e implementação local, com detecção de revisões antigas e recuperação explícita por backup.
- `src/hooks/use-finance.ts`: carregamento após a montagem, confirmação de gravação, sincronização entre abas e tratamento de falhas.
- `src/components`: tela principal, formulários e lista responsiva; `ui` contém componentes adicionados pelo CLI do shadcn.

Valores são armazenados em centavos inteiros e datas em `YYYY-MM-DD`. O formato de backup é versionado. O fuso de referência para o dia atual é `America/Sao_Paulo`.

## Próxima etapa

Login, conexão bancária, pagamentos parciais de fatura, outras fontes de receita, deploy e PWA ficam para entregas futuras. A interface acessa o armazenamento por um contrato assíncrono para facilitar essa evolução.
# gastos
# gastos
