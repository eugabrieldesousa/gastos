# mês. — Controle de gastos

Painel financeiro pessoal para acompanhar salário, gastos avulsos, contas fixas, faturas de cartão e compras parceladas. Construído com Next.js App Router, TypeScript, Tailwind CSS e componentes shadcn/ui (Radix). A interface fica na viewport, com rolagem dentro das áreas de conteúdo.

## Executar

Requisitos: Node.js LTS (24 recomendado), npm e Git. Após instalar ou preparar as ferramentas, reabra o terminal para atualizar o PATH.

```powershell
npm install
npm run dev
```

Acesse **http://127.0.0.1:3000**. O modo local funciona sem variáveis de ambiente. Para entrar com GitHub e salvar entre dispositivos, configure os serviços abaixo.

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
- **Ajuda dos bancos:** em Importações, abra “Onde baixar meu arquivo?” para consultar os caminhos de contas e faturas do BB, Itaú e Mercado Pago e os formatos compatíveis. PDF não é aceito; as opções de exportação dependem do banco e do canal.
- **Aparência:** no menu Tema, escolha Claro, Escuro ou Sistema. A escolha acompanha as outras abas e fica salva em `mes.theme`, separada dos dados financeiros e do backup. Todas as áreas roláveis usam cores do tema; em contraste forçado, respeitam as cores do sistema.
- Revise cada linha: crie um gasto, vincule uma ocorrência existente, registre pagamento de dívida, vincule pagamento integral de fatura ou ignore a movimentação. No cartão, confirme o mês de vencimento e os dados de parcelamentos antes de criar as parcelas restantes. O extrato da conta não deve cadastrar o pagamento de fatura como outra despesa.
- Identificadores bancários são únicos por origem; sem identificador, o mesmo arquivo é reconhecido pelo conteúdo e pela linha, mesmo após renomear. Arquivos sobrepostos geram avisos de possível duplicidade: vincule o gasto ou confirme outra transação legítima. Editar ou excluir um gasto mantém a identidade importada. Linhas ignoradas podem ser revistas ao importar o arquivo novamente; “Deixar sem alterar” mantém a linha pendente. O lote inteiro é salvo de uma vez e uma revisão desatualizada precisa ser refeita.
- Importação aceita somente reais. PDF, fotos, receitas e contabilização de estornos ficam fora desta versão. Entradas, estornos e transferências próprias reconhecidas ficam visíveis para revisão sem virarem gastos. Layouts bancários variam; use o mapeamento de colunas conforme o arquivo exportado. Arquivos originais não entram no backup, somente os dados normalizados e a rastreabilidade.
- A sobra é o salário menos todos os gastos pagos e previstos. Sem salário informado, ela fica sem cálculo; salário zero é válido.
- No menu **Backup**, exporte todos os meses ou restaure um arquivo JSON. A restauração exige confirmação e substitui todos os dados atuais.

Sem login, os dados ficam no `localStorage`, na chave `mes.finance.v1`, exclusivos daquele navegador e endereço. Limpar os dados do navegador remove esses registros. Use backups para guardá-los.

Com login, os dados são gravados no PostgreSQL por conta GitHub. Entre com o mesmo GitHub no celular ou computador para acessar seus lançamentos. O app atualiza ao voltar à tela, entre abas e a cada 30 segundos enquanto visível. Alterações concorrentes exigem recarregar antes de salvar; falhas de rede não são anunciadas como salvamento. Não há edição offline no modo conectado.

No primeiro login, se a conta ainda não tiver dados salvos, abra **Conta → Transferir dados deste navegador**. A transferência exige confirmação e mantém a cópia local. Se seus dados estavam em outro endereço (por exemplo, localhost), exporte o backup lá e restaure na conta após entrar no site. Sair da conta retorna ao armazenamento local, sem copiar os dados privados da conta para ele. Tema e arquivos bancários originais continuam fora do banco.

O documento e os backups usam a versão **3**. A chave antiga foi mantida para encontrar os registros existentes. A leitura e a restauração migram as versões 1 e 2 sem alterar valores, datas, salários, categorias, parcelas ou situações; a próxima gravação salva a versão 3. Os backups incluem dívidas, origens e registros de importação. Backups inválidos não substituem os dados atuais.

## Verificar

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:auth
```

Se outra versão do app já estiver na porta 3000, use uma porta livre para os testes: no PowerShell, execute `$env:PLAYWRIGHT_PORT = '3001'` antes de `npm run test:e2e`.

Os testes unitários cobrem cálculos, valores brasileiros, datas, migração, categorias, recorrências, distribuição de centavos, parcelas em andamento, quitação de faturas, dívidas, leitura de OFX/CSV/XLS/XLSX, duplicidades, lotes e falhas no armazenamento. Os testes de navegador cobrem os fluxos completos em desktop e celular, além de listas extensas em 1366×768 e 1440×900; iniciam um servidor local se necessário.

Os testes da API também verificam sessão obrigatória, isolamento por identidade, origem das gravações, validação, revisões concorrentes e falhas de rede. `test:auth` usa o build de produção na porta 3003 e credenciais de teste para verificar a partida do OAuth em desktop e celular; a autorização GitHub é interceptada, sem chamar o banco. Testes locais não substituem a verificação do OAuth e do banco reais após configurar a Vercel.

## GitHub, Vercel e salvamento entre dispositivos

O repositório remoto é `https://github.com/eugabrieldesousa/gastos.git`. Em [Vercel → gastos → Settings → Git](https://vercel.com/eugabrieldesousa-9825s-projects/gastos/settings/git), conecte esse repositório com branch de produção `main`. A integração nativa utiliza autorização GitHub; não precisa de token pessoal no código ou nas variáveis do app.

1. Em Vercel → projeto → **Storage → Create Database**, escolha **Neon Postgres**, crie ou conecte o banco e vincule-o ao projeto. Confirme a variável privada `DATABASE_URL` em **Settings → Environment Variables**. Se a integração oferecer outro nome para a conexão, cadastre a mesma URL como `DATABASE_URL`. Escolha conscientemente o plano e a região do banco.
2. Em [GitHub → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new), crie uma aplicação com nome `mês. – gastos`, homepage `https://gastos-six-rho.vercel.app` e **Authorization callback URL** `https://gastos-six-rho.vercel.app/api/auth/callback/github`. Anote o **Client ID** e gere um **Client Secret**. Essa aplicação serve para identificar usuários; não solicita acesso aos repositórios. [Configuração oficial do provedor](https://authjs.dev/getting-started/providers/github).
3. Em Vercel → **Settings → Environment Variables**, configure para **Production**:

   | Variável | Valor |
   | --- | --- |
   | `AUTH_GITHUB_ID` | Client ID da OAuth App |
   | `AUTH_GITHUB_SECRET` | Client Secret da OAuth App |
   | `AUTH_SECRET` | Segredo aleatório gerado pelo comando abaixo |
   | `AUTH_URL` | `https://gastos-six-rho.vercel.app` |
   | `DATABASE_URL` | URL PostgreSQL do Neon |

   Execute `npm run auth:secret` para gerar o segredo em `.env.local`. O comando mantém um segredo já existente e não imprime seu valor. Copie o valor diretamente desse arquivo para a variável da Vercel, sem enviá-lo em mensagens. Nunca use prefixo `NEXT_PUBLIC_`, nem comite `.env.local`. [Instalação e segredo do Auth.js](https://authjs.dev/getting-started/installation).
4. Faça deploy da alteração e **Redeploy** depois de salvar as variáveis. O `prebuild` prepara a tabela com `CREATE TABLE IF NOT EXISTS` quando `DATABASE_URL` estiver presente, sem apagar registros. Uma falha na preparação impede o build. Também é possível executar `npm run db:migrate` separadamente.
5. Abra o site e clique **Entrar com GitHub**. Transfira os dados locais ou restaure seu backup. Entre no celular com o mesmo GitHub e confira uma alteração feita no computador; teste também sair e entrar novamente. Outra conta GitHub deve iniciar sem os dados da primeira.

Para desenvolvimento, use `.env.local` (veja `.env.example`) e uma **OAuth App separada** com callback `http://127.0.0.1:3000/api/auth/callback/github` e `AUTH_URL=http://127.0.0.1:3000`. O GitHub permite uma callback por OAuth App. Não copie a configuração de produção indiscriminadamente para previews com domínio diferente; configure um ambiente de teste com callback estável e banco próprio.

As rotas consultam a sessão no servidor e vinculam os documentos ao ID imutável da conta GitHub. A API não aceita escolher outro usuário pelo corpo da solicitação. Gravações validam o documento e usam revisão atômica no banco, sem cache compartilhado de dados financeiros. O formato de backup continua na versão 3. O limite de sincronização é de 4 MB por documento; o limite de 20 MB continua valendo para arquivos bancários processados no navegador.

## Organização

- `src/lib/finance.ts`: tipos, validações e cálculos independentes da interface.
- `src/lib/repository.ts`: contrato assíncrono de armazenamento e implementação local, com detecção de revisões antigas e recuperação explícita por backup.
- `src/lib/remote-repository.ts`, `cloud-store.ts` e `finance-api.ts`: armazenamento remoto por sessão, validação e revisão atômica.
- `src/auth.ts`: autenticação GitHub pelo Auth.js; credenciais e tokens ficam no servidor.
- `src/hooks/use-finance.ts`: carregamento após a montagem, confirmação de gravação, sincronização entre abas e tratamento de falhas.
- `src/components`: tela principal, formulários e lista responsiva; `ui` contém componentes adicionados pelo CLI do shadcn.

Valores são armazenados em centavos inteiros e datas em `YYYY-MM-DD`. O formato de backup é versionado. O fuso de referência para o dia atual é `America/Sao_Paulo`.

## Próxima etapa

Conexão bancária automática, pagamentos parciais de fatura, outras fontes de receita e PWA ficam para entregas futuras.
