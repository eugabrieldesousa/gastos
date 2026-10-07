# Orbt — Sua central pessoal

Central pessoal para acompanhar salário, ganhos extras, gastos, contas fixas, faturas, parcelamentos, dívidas e notas. Construída com Next.js App Router, TypeScript, Tailwind CSS e componentes shadcn/ui (Radix). A interface fica na viewport, com rolagem dentro das áreas de conteúdo.

## Executar

Requisitos: Node.js LTS (24 recomendado), npm e Git. Após instalar ou preparar as ferramentas, reabra o terminal para atualizar o PATH.

```powershell
npm install
npm run dev
```

Acesse **http://127.0.0.1:3000**. O modo local funciona sem variáveis de ambiente. Para entrar com GitHub e salvar entre dispositivos, configure os serviços abaixo.

## Uso

- **Navegação:** sidebar à esquerda, com Finanças e Notas. No desktop, recolha para ícones ou expanda; a preferência fica em `orbt.sidebar.collapsed`. No celular, abra o menu no topo. Gastos continua sendo a tela inicial.
- **Ganhos:** o salário é separado dos ganhos extras. Cadastre descrição, valor, data e situação Recebido ou Previsto. A data define o mês e pode ser corrigida ao receber. Ganhos previstos entram na projeção, sem comprovar recebimento. Edição e exclusão recalculam os totais. Neste MVP, os ganhos são manuais, sem recorrência ou importação bancária.
- **Notas:** crie notas com título e texto simples. O título vazio aparece como “Sem título”. As notas independem do mês e são ordenadas pela última alteração. O editor salva após 1,2 segundo sem digitação, mostrando o estado de salvamento. Ao trocar de nota, sair da seção, exportar ou sair da conta, o app conclui a gravação pendente. Uma falha mantém o rascunho no editor e bloqueia essas ações até recuperar o salvamento. Em conflitos, recarregue e revise a versão salva antes de escolher qual texto manter. Rascunhos pendentes ficam na memória da página; ao fechar com alterações pendentes, o navegador mostra um aviso. Exclusões exigem confirmação.
- Navegue entre meses pelas setas ou pelo seletor de mês e informe o salário líquido.
- **Dashboard:** distribuição por categoria e tipo, vencimentos, comprometimento do salário, comparação mensal e compromissos dos próximos seis meses. Clique nos gráficos ou nas legendas para filtrar os gastos.
- **Gastos:** tela inicial, com lançamentos diretos e faturas agrupadas por cartão, inicialmente recolhidas. Os filtros abrem as faturas encontradas e mostram o subtotal filtrado junto do total da fatura. Cadastre valores em reais (ex.: `1.234,56`) e filtre por descrição, categoria, tipo e situação. Gastos fora do cartão pertencem ao mês da data informada.
- **Fixos:** informe início e término opcional. Os outros meses são previstos sem duplicar dados; edite uma ocorrência ou as futuras, ou encerre a recorrência pelo menu de ações. O pagamento de uma ocorrência não paga os próximos meses.
- **Cartões e faturas:** cadastre nome, fechamento e vencimento. Confira a fatura sugerida pela data da compra; o mês pode ser corrigido manualmente. A data do fechamento inicia o próximo ciclo, e o vencimento vem após o fechamento. Dias inexistentes usam o último dia do mês.
- As faturas separam compras em uma vez e parcelas. Quite a fatura inteira ou desfaça a quitação. Para alterar seus itens, desfaça a quitação primeiro. O pagamento altera a situação dos gastos, sem adicionar uma nova despesa.
- **Parcelamentos:** para compras novas, informe o valor total e a quantidade de parcelas. Para compras em andamento, informe o valor de cada parcela e a parcela inicial (ex.: 4 de 10). As anteriores são histórico informado, sem pagamentos inventados. Acompanhe quitadas, pendentes, saldo e término. A barra indica a posição da parcela no calendário: 4/5 ocupa 80%, inclusive em compras em andamento. Histórico, pagamentos registrados e parcela atual são identificados separadamente.
- **Categorias:** crie categorias com nome, cor e ícone; renomeie, arquive ou reative. O histórico é preservado. As categorias incluem Carro, Trabalho, Lazer, Música, Telefonia e internet e Assinaturas.
- **Dívidas:** cadastre o valor original, credor, entrada, total pago depois da entrada e mês inicial do acompanhamento. Entrada e histórico reduzem o saldo sem gerar gastos retroativos. Registre pagamentos variáveis ou vincule um gasto direto já existente. O saldo, progresso e histórico acompanham edições e exclusões. A média dos últimos três meses completos inclui meses sem pagamento como zero, exclui o mês atual e o histórico sem datas, e estima a quitação a partir do próximo mês. Sem média positiva, a previsão fica indisponível. A previsão não cria gastos futuros; dívidas são sem juros.
- **Dívidas por custos:** em Nova dívida, escolha “Por custos” e informe os itens com descrição e valor. O total é calculado pela soma da lista; você pode colar várias linhas, revisar a prévia e incorporar os itens antes de salvar. A descrição geral é opcional e os custos começam recolhidos no cartão: expanda “Custos” para editar e excluir ou use “Adicionar custo” mesmo com a lista fechada. Custos aumentam o saldo sem criar gastos mensais; registre pagamentos separadamente. Novos custos reabrem dívidas quitadas. Exclusões exigem confirmação, e o total não pode ficar abaixo do já amortizado. O tipo permanece fixo após o cadastro; dívidas e backups antigos continuam como “Valor fixo”.
- **Parcelamento combinado:** cadastre uma dívida sem cartão com valor total, quantidade de parcelas (2 a 360), quantidade já paga e vencimento da primeira parcela restante. O app distribui os centavos e prevê uma parcela mensal, ajustando dias inexistentes ao último dia do mês. As parcelas anteriores ficam como histórico sem gastos retroativos. Pague uma parcela inteira manualmente pela seção Dívidas ou pelas ações de Gastos; pode antecipar uma parcela futura. A data real define o mês do gasto e o vencimento combinado é preservado. Editar a data move o gasto entre meses; desfazer restaura a parcela prevista no vencimento original. O saldo considera somente histórico e parcelas pagas. Os planos ficam na seção Dívidas com lista recolhível, progresso e calendário combinado. Dados gerais podem ser editados; total, histórico e calendário permanecem definidos no cadastro. Na importação, selecione a parcela existente de valor integral igual à movimentação para evitar duplicar o pagamento.
- **Importações:** crie uma origem para cada conta ou cartão do BB, Mercado Pago ou Itaú e selecione um extrato OFX, CSV, XLS ou XLSX de até 20 MB. Nas planilhas, confira a aba, cabeçalho, colunas e sinal dos gastos. Esse mapeamento é salvo por origem. A importação não exige senhas, servidor ou serviços externos; os arquivos são processados no navegador.
- **Ajuda dos bancos:** em Importações, abra “Onde baixar meu arquivo?” para consultar os caminhos de contas e faturas do BB, Itaú e Mercado Pago e os formatos compatíveis. PDF não é aceito; as opções de exportação dependem do banco e do canal.
- **Aparência:** no menu Tema, escolha Claro, Escuro ou Sistema. A escolha acompanha as outras abas e fica salva em `mes.theme`, separada dos dados financeiros e do backup. Todas as áreas roláveis usam cores do tema; em contraste forçado, respeitam as cores do sistema.
- Revise cada linha: crie um gasto, vincule uma ocorrência existente, registre pagamento de dívida, vincule pagamento integral de fatura ou ignore a movimentação. No cartão, confirme o mês de vencimento e os dados de parcelamentos antes de criar as parcelas restantes. O extrato da conta não deve cadastrar o pagamento de fatura como outra despesa.
- Identificadores bancários são únicos por origem; sem identificador, o mesmo arquivo é reconhecido pelo conteúdo e pela linha, mesmo após renomear. Arquivos sobrepostos geram avisos de possível duplicidade: vincule o gasto ou confirme outra transação legítima. Editar ou excluir um gasto mantém a identidade importada. Linhas ignoradas podem ser revistas ao importar o arquivo novamente; “Deixar sem alterar” mantém a linha pendente. O lote inteiro é salvo de uma vez e uma revisão desatualizada precisa ser refeita.
- Importação aceita somente reais. PDF, fotos, receitas e contabilização de estornos ficam fora desta versão. Entradas, estornos e transferências próprias reconhecidas ficam visíveis para revisão sem virarem gastos. Layouts bancários variam; use o mapeamento de colunas conforme o arquivo exportado. Arquivos originais não entram no backup, somente os dados normalizados e a rastreabilidade.
- A sobra prevista é o salário mais os ganhos extras recebidos e previstos e a sobra recebida, menos todos os gastos pagos e previstos. Sem salário, o cálculo usa os ganhos extras com um aviso; sem salário e sem extras, a previsão total fica sem cálculo. Salário zero é válido. No mês atual, use **Simular próximo mês** para visualizar receitas, gastos e sobra do seguinte. A simulação só é salva ao confirmar. Em meses anteriores, use **Levar sobra para o próximo mês**. A transferência vai apenas ao mês seguinte, pode ser editada ou removida e não muda quando os dados do mês de origem são alterados. Não cria receitas nem despesas.
- No menu **Backup**, exporte todos os meses, gere um **relatório para IA** ou restaure um arquivo JSON. O relatório separado explica as unidades monetárias, salários ausentes, faturas, parcelas, dívidas, sobras e projeções dos seis meses seguintes ao mês selecionado. É gerado no navegador, sem envio a uma IA, e não serve para restauração. A restauração exige confirmação e substitui todos os dados atuais.

Sem login, os dados ficam no `localStorage`, na chave `mes.finance.v1`, exclusivos daquele navegador e endereço. Limpar os dados do navegador remove esses registros. Use backups para guardá-los.

Com login, cada alteração é salva primeiro em uma cópia de trabalho deste navegador, separada por ID de conta, e enviada para o repositório GitHub privado. O app distingue **Salvo neste aparelho** de **Salvo no GitHub**. Com o app já aberto e os dados carregados, você pode continuar editando sem internet. As pendências e rascunhos de notas sobrevivem ao recarregar e ficam vinculados à conta original ao sair; não são copiados para o modo visitante nem para outra conta. Abrir o site pela primeira vez sem internet não é suportado.

Em **Conta → Atualizar dados da conta**, um único botão envia as alterações pendentes e busca as atualizações da conta. O menu mostra andamento, sucesso ou erro e a última sincronização. Também há tentativas automáticas após editar, ao recuperar a conexão, ao voltar ao app e a cada 30 segundos enquanto visível. Cada envio confirmado cria um commit. Uma resposta perdida é conferida por uma nova leitura antes de repetir o envio.

Se dois aparelhos alterarem os dados, a sincronização para e preserva ambas as versões. Em **Conta → Revisar conflito**, baixe os dois backups e escolha **Manter dados deste aparelho** ou **Usar dados da conta**, com confirmação. A escolha substitui o documento inteiro, sem mesclar lançamentos automaticamente. A versão substituída fica disponível em **Conta → Backups de conflitos**; baixe-a e restaure pelo menu Backup se necessário. Uma nova mudança na conta exige nova revisão.

Em **TODO**, logo abaixo de Notas, adicione, edite e exclua tarefas e marque o checkbox para concluir ou reabrir. Pendentes aparecem antes das concluídas, que permanecem visíveis com texto riscado. Cada tarefa aceita até 500 caracteres; o documento permite até 10.000 tarefas.

**Backup → Limpar tudo** pede confirmação e apaga todos os meses, registros financeiros, categorias personalizadas, notas e tarefas, restaurando as categorias iniciais. Com login, afeta a conta em uso e sua cópia de trabalho; sem login, somente os dados deste navegador. A cópia independente do modo visitante, login e aparência são preservados. Sem internet, o app informa que a exclusão na conta está pendente. A limpeza segue as mesmas regras de conflito da sincronização e não apaga o histórico do GitHub.

No primeiro login, se a conta ainda não tiver dados salvos, abra **Conta → Transferir dados deste navegador**. A transferência exige confirmação e mantém a cópia local. Se seus dados estavam em outro endereço (por exemplo, localhost), exporte o backup lá e restaure na conta após entrar no site. **Conta → Ver histórico no GitHub** abre os commits. Sair da conta retorna ao armazenamento local, sem copiar os dados privados da conta para ele. Tema e arquivos bancários originais continuam fora do repositório de dados.

O documento e os backups usam a versão **6**. A chave antiga foi mantida para encontrar os registros existentes. A leitura e a restauração migram as versões 1–5 sem alterar valores, datas, salários, categorias, parcelas ou situações; tarefas começam vazias, e ganhos/notas existentes são preservados. A próxima gravação salva a versão 6. Os backups incluem tarefas, ganhos, notas, dívidas, origens e registros de importação. O relatório para IA inclui os ganhos e projeções financeiras, sem incluir notas ou tarefas. Backups inválidos não substituem os dados atuais. A sincronização mantém o limite de 4 MB por documento; cada nota aceita até 120 caracteres de título e 100.000 de conteúdo. A cópia de trabalho usa o armazenamento do navegador: falhas de quota ou permissão impedem confirmar a edição e preservam os dados anteriores.

## Verificar

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:auth
npm run test:sync
```

Se outra versão do app já estiver na porta 3000, use uma porta livre para os testes: no PowerShell, execute `$env:PLAYWRIGHT_PORT = '3001'` antes de `npm run test:e2e`.

Os testes unitários cobrem cálculos, valores brasileiros, datas, migração, categorias, recorrências, distribuição de centavos, parcelas em andamento, quitação de faturas, dívidas, leitura de OFX/CSV/XLS/XLSX, duplicidades, lotes e falhas no armazenamento. Os testes de navegador cobrem os fluxos completos em desktop e celular, além de listas extensas em 1366×768 e 1440×900; iniciam um servidor local se necessário.

Os testes da API também verificam sessão obrigatória, conta proprietária, repositório privado, origem das gravações, validação, revisões e SHA concorrentes, primeiro commit, arquivos grandes e falhas de rede. `test:auth` usa o build de produção na porta 3003 e credenciais de teste para verificar a partida do OAuth em desktop e celular; a autorização GitHub é interceptada, sem acessar os dados reais. `test:sync` usa a porta 3004, uma sessão assinada exclusivamente para teste e a API financeira simulada no navegador para verificar envio, busca, feedback, edição offline, resposta perdida, limpeza e conflitos em desktop e celular. Testes locais não substituem a verificação do OAuth e dos commits reais após configurar a Vercel.

## GitHub, Vercel e salvamento entre dispositivos

O repositório do código é `https://github.com/eugabrieldesousa/gastos.git`, conectado à Vercel na branch `main`. Ele é público e não deve receber arquivos financeiros. O armazenamento segue o modelo de conteúdo em Git usado pelo Decap CMS, mantendo a interface financeira do app. Não é necessário Neon, Supabase ou outro banco de dados.

1. Use o repositório privado [eugabrieldesousa/gastos-dados](https://github.com/eugabrieldesousa/gastos-dados), já criado com README e branch `main`, e mantenha-o privado. Para usar outro repositório, crie-o como **Private** e marque **Add a README file** para iniciar a branch. Não conecte o repositório de dados à Vercel nem adicione Actions para cada salvamento: os commits financeiros não precisam gerar builds.
2. Em [GitHub → Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new), crie um token com o proprietário `eugabrieldesousa`, acesso a **Only select repositories → gastos-dados**, e permissão **Repository permissions → Contents: Read and write**. Metadata de leitura já acompanha o token. Defina uma validade e atualize o token da Vercel antes de expirar. Não conceda acesso ao repositório do código ou aos demais repositórios. [Permissões oficiais da API de arquivos](https://docs.github.com/en/rest/repos/contents).
3. Em [GitHub → Developer settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new), crie uma aplicação com nome `Orbt`, homepage `https://gastos-six-rho.vercel.app` e **Authorization callback URL** `https://gastos-six-rho.vercel.app/api/auth/callback/github`. Anote o **Client ID** e gere um **Client Secret**. A OAuth App identifica sua conta; o token separado do passo 2 grava os arquivos. [Configuração oficial do provedor](https://authjs.dev/getting-started/providers/github).
4. Em Vercel → **Settings → Environment Variables**, configure para **Production**:

   | Variável | Valor |
   | --- | --- |
   | `AUTH_GITHUB_ID` | Client ID da OAuth App |
   | `AUTH_GITHUB_SECRET` | Client Secret da OAuth App |
   | `AUTH_SECRET` | Segredo aleatório gerado pelo comando abaixo |
   | `AUTH_URL` | `https://gastos-six-rho.vercel.app` |
   | `GITHUB_DATA_REPOSITORY` | `eugabrieldesousa/gastos-dados` |
   | `GITHUB_DATA_TOKEN` | Token restrito ao repositório privado do passo 2 |
   | `GITHUB_DATA_BRANCH` | Opcional; sem valor usa a branch padrão do repositório |

   Execute `npm run auth:secret` para gerar o segredo em `.env.local`. O comando mantém um segredo já existente e não imprime seu valor. Copie o valor diretamente desse arquivo para a variável da Vercel, sem enviá-lo em mensagens. Nunca use prefixo `NEXT_PUBLIC_`, nem comite `.env.local`. [Instalação e segredo do Auth.js](https://authjs.dev/getting-started/installation).
5. Faça **Redeploy** depois de salvar as variáveis. Não há migração de banco ou commits de dados durante o build. Variáveis `DATABASE_URL` da implementação anterior não são utilizadas.
6. Abra o site e clique **Entrar com GitHub**. Transfira os dados locais ou restaure seu backup. Entre no celular com o mesmo GitHub e confira uma alteração feita no computador. Em **Conta → Ver histórico no GitHub**, confira o commit de cada salvamento. Outra conta GitHub terá o acesso recusado antes da consulta ao arquivo financeiro.

Para desenvolvimento, use `.env.local` (veja `.env.example`) e uma **OAuth App separada** com callback `http://127.0.0.1:3000/api/auth/callback/github` e `AUTH_URL=http://127.0.0.1:3000`. O GitHub permite uma callback por OAuth App. Use um repositório privado de teste para evitar alterar seus dados reais durante desenvolvimento. Não disponibilize o token de produção em previews de código não confiável.

O servidor verifica a sessão, a privacidade do repositório e o ID imutável da conta proprietária antes de ler ou escrever. Os arquivos ficam em `data/<ID-numérico-GitHub>/finance.json`. A API não aceita escolher o usuário ou o repositório pelo corpo da solicitação. Gravações validam o documento e conferem a revisão, um checksum do estado lido pelo dispositivo e o SHA do arquivo. Isso detecta também edições diretas no GitHub que mantiveram a revisão numérica. Conflitos não são resolvidos com sobrescrita forçada. A confirmação exige que o GitHub tenha retornado o commit. Tokens ficam somente no servidor e não entram no backup ou na sessão do navegador.

O formato financeiro e de backup usa a versão 6. O limite de sincronização é de 4 MB por documento; o limite de 20 MB continua valendo para arquivos bancários processados no navegador. Arquivos maiores que 1 MB são lidos pela representação raw, fixada ao mesmo commit do metadado. Excluir um gasto no app altera o arquivo atual, mas suas versões anteriores continuam no histórico Git. Arquivos inválidos são preservados e precisam ser recuperados pelo histórico do repositório antes de voltar a gravar.

O modelo pode funcionar sem custo em **GitHub Free + Vercel Hobby**, dentro dos limites para uso pessoal e não comercial. Nenhum serviço pago ou banco é necessário. Limites de API e hospedagem continuam aplicáveis. [GitHub Free](https://docs.github.com/en/get-started/learning-about-github/githubs-plans), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [limites da API GitHub](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

## Organização

- `src/lib/finance.ts`: tipos, validações e cálculos independentes da interface.
- `src/lib/repository.ts`: contrato assíncrono de armazenamento e implementação local, com detecção de revisões antigas e recuperação explícita por backup.
- `src/lib/remote-repository.ts`, `github-store.ts`, `cloud-store.ts` e `finance-api.ts`: armazenamento Git privado, validação por sessão e proteção por revisão e SHA.
- `src/lib/account-repository.ts`: cópia de trabalho por conta, pendências offline, confirmação de envios, conflitos e backups de recuperação.
- `src/auth.ts`: autenticação GitHub pelo Auth.js; credenciais e tokens ficam no servidor.
- `src/hooks/use-finance.ts`: carregamento após a montagem, confirmação de gravação, sincronização entre abas e tratamento de falhas.
- `src/components`: tela principal, formulários e lista responsiva; `ui` contém componentes adicionados pelo CLI do shadcn.

Valores são armazenados em centavos inteiros e datas em `YYYY-MM-DD`. O formato de backup é versionado. O fuso de referência para o dia atual é `America/Sao_Paulo`.

## Próxima etapa

Conexão bancária automática, pagamentos parciais de fatura, recorrência de ganhos, formatação de notas e PWA ficam para entregas futuras.
