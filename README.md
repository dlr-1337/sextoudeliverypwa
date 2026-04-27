# Sextou Delivery PWA

Sextou Delivery é uma base Next.js para delivery local. Este guia é para uma pessoa engenheira interna ou agente que acabou de clonar o projeto e precisa levantar uma instância local segura, com banco PostgreSQL descartável, seed inicial e verificação M001+M002 reproduzível sem expor segredos.

## O que M001+M002 entregam

O M001 entrega a fundação operacional do produto:

- aplicativo Next.js com rotas públicas, privadas e feedbacks seguros em português;
- PostgreSQL com Prisma, migrações versionadas e seed idempotente;
- autenticação por e-mail e senha, sessão httpOnly e guards por perfil;
- cadastro de consumidores e estabelecimentos;
- área administrativa para dashboard, categorias, clientes e estabelecimentos;
- painel do estabelecimento com perfil, uploads locais, produtos e ciclo de vida;
- catálogo público que mostra apenas lojas aprovadas/ativas e produtos ativos;
- comandos de smoke e verificação final para reexecutar S01 a S05 sem reset destrutivo.

O M002 entrega o primeiro fluxo de compra em dinheiro:

- consumidor monta carrinho no catálogo público com produtos de uma única loja por pedido;
- `/checkout` exige sessão CUSTOMER, preserva o carrinho após login e coleta contato, endereço, referência, observação e forma de pagamento;
- CASH é o único método confirmável no M002; PIX e cartão podem aparecer como indisponíveis, mas não criam pagamento fake nem chamam gateway;
- o backend cria pedido, itens, pagamento manual e histórico inicial em transação, recalculando valores no servidor;
- `/pedido/[publicCode]` mostra confirmação/acompanhamento público com status, itens, totais, estabelecimento, pagamento em dinheiro e linha do tempo básica;
- a prova final usa navegador real, servidor Next local e PostgreSQL descartável para validar catálogo ativo → carrinho → login CUSTOMER → checkout CASH → pedido real → acompanhamento público.

Ainda não fazem parte do runtime entregue: gateway real de PIX/cartão, assinaturas/cobrança mensal, storage S3/R2/MinIO em produção, deploy/PWA final, métricas centralizadas, rate limiting avançado, transições operacionais do lojista para pedidos e integrações externas.

Para revisar a cobertura requisito por requisito, consulte [`docs/m001-requirements-coverage.md`](docs/m001-requirements-coverage.md) para a fundação M001 e [`docs/m002-requirements-coverage.md`](docs/m002-requirements-coverage.md) para o fluxo M002.

## Pré-requisitos

- Node.js 20.19 ou superior.
- npm compatível com o lockfile do projeto.
- PostgreSQL acessível localmente ou em ambiente descartável.
- Um banco de dados de desenvolvimento que possa receber migrações, seed e linhas descartáveis de smoke/E2E.
- Permissão de escrita no diretório local de uploads configurado.
- Chromium do Playwright instalado quando for rodar o E2E de navegador.

Nunca aponte os comandos de desenvolvimento ou verificação para um banco com dados reais de produção. Os smokes e E2E criam usuários, lojas, produtos, pedidos, pagamentos e sessões descartáveis.

## Configuração de ambiente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para um arquivo `.env` local e não versionado.
3. Substitua todos os placeholders de segredo por valores reais somente no `.env` local.
4. Configure os grupos ativos no M001+M002:
   - aplicação: URL pública local e ambiente;
   - PostgreSQL: `DATABASE_URL` para comandos que tocam o banco;
   - autenticação e sessão: segredo, nome do cookie e expiração;
   - seed: credenciais iniciais do administrador local;
   - upload local: driver, pasta, URL pública e limite de bytes.
5. Mantenha os grupos de S3/R2/MinIO e pagamentos fake/dev como placeholders não-runtime no M002. Eles não devem conter credenciais reais nem ser usados para PIX/cartão.

`.env.example` é seguro para commit e deve continuar sem segredos reais. `.env` fica ignorado pelo git. Ao depurar, registre apenas nomes de variáveis ausentes; não imprima `DATABASE_URL`, senhas, tokens, hashes, segredos de sessão ou payloads de provider.

## PostgreSQL, Prisma e seed

Use um banco PostgreSQL descartável para desenvolvimento e verificação. A URL deve seguir o formato do provedor PostgreSQL e ficar somente no `.env` local.

Comandos principais:

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
```

Use `npm run db:migrate` quando estiver desenvolvendo migrações localmente. Use `npm run db:deploy` para aplicar migrações já versionadas, inclusive no fluxo de verificação final. `npm run db:seed` valida as variáveis de seed, cria ou atualiza um usuário ADMIN ativo e garante as categorias base de estabelecimentos e produtos.

`npm run db:format` e `npm run db:generate` são comandos de schema/codegen. Os comandos que alteram ou leem o banco exigem `DATABASE_URL` e falham mostrando apenas o nome da variável ausente.

## Desenvolvimento local

Depois de configurar o `.env`, rode:

```bash
npm run dev
```

Abra a aplicação na URL configurada em `NEXT_PUBLIC_APP_URL`, normalmente `http://localhost:3000`.

Rotas úteis:

- `/` — visão pública da aplicação;
- `/login` — entrada por e-mail e senha;
- `/cadastro` — cadastro de consumidor ou estabelecimento;
- `/conta` — área protegida do consumidor;
- `/admin` — dashboard administrativo;
- `/admin/estabelecimentos` — gestão de estabelecimentos;
- `/admin/categorias` — gestão de categorias;
- `/admin/clientes` — consulta administrativa de clientes;
- `/estabelecimento` — painel privado do lojista;
- `/lojas` — catálogo público de lojas ativas;
- `/lojas/[slug]` — catálogo público de uma loja ativa, com carrinho local;
- `/checkout` — revisão do carrinho, endereço e confirmação CASH para CUSTOMER autenticado;
- `/pedido/[publicCode]` — confirmação/acompanhamento público do pedido;
- `/acesso-negado` — feedback seguro para rotas privadas recusadas;
- `/uploads/...` — leitura pública de imagens geradas pelo upload local.

## Upload local

O M001+M002 suporta apenas `UPLOAD_DRIVER="local"`. Os arquivos são gravados no diretório de runtime definido por `UPLOAD_DIR`, com padrão `./uploads`, e são servidos a partir de `UPLOAD_PUBLIC_BASE_URL`.

Regras importantes:

- `UPLOAD_PUBLIC_BASE_URL` deve apontar para uma URL HTTP/HTTPS sem query/hash ou para um caminho raiz como `/uploads`.
- `UPLOAD_MAX_BYTES` é um inteiro positivo em bytes; o exemplo usa 5 MiB.
- Somente imagens PNG, JPEG/JPG e WebP são aceitas, validadas pelo conteúdo do arquivo.
- Nomes finais são gerados pelo servidor; nomes originais enviados pelo usuário não devem aparecer em logs ou URLs persistidas.
- `uploads/` é runtime local e fica ignorado pelo git.

## Verificação M001

Quando o ambiente estiver apontando para um banco descartável e o seed estiver preenchido, rode:

```bash
npm run verify:m001
```

O comando executa, nesta ordem: `npm run db:generate`, `npm test`, `npm run lint`, `npm run build`, `npm run db:deploy`, `npm run db:seed` e `npm run smoke:m001`.

Para isolar problemas nos smokes integrados do M001, rode:

```bash
npm run smoke:m001
```

Os smokes S01–S05 devem imprimir apenas rótulos seguros, booleans e contagens. Não registre URLs de banco, tokens de sessão, hashes de senha, segredos de seed, caminhos absolutos de upload ou nomes originais de arquivos.

## Verificação M002 com PostgreSQL descartável e navegador real

Use este fluxo quando precisar provar o dinheiro E2E localmente:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run smoke:m002
npm run e2e:m002
npm run verify:m002
```

Se o Playwright informar que o Chromium não está instalado, rode uma vez:

```bash
npx playwright install chromium
```

`npm run smoke:m002` encadeia o smoke CASH de pedido e o fixture M002. Ele exige `DATABASE_URL`, `AUTH_SECRET`, `SESSION_COOKIE_NAME` e `SESSION_MAX_AGE_DAYS` antes de tocar Prisma. `npm run e2e:m002` abre Chromium pelo Playwright, inicia o servidor Next local deste checkout, cria dados descartáveis, dirige o fluxo real no navegador e consulta o PostgreSQL pelo código público criado.

`npm run verify:m002` é o contrato completo e pesado para uso local/CI: `db:generate`, `npm test`, `lint`, `build`, `db:deploy`, `db:seed`, `smoke:m001`, `smoke:m002` e `e2e:m002`, nessa ordem. Ele não executa `migrate reset`, `db push`, truncate nem limpeza destrutiva; quando algo falha, a cadeia para no estágio com problema.

A prova M002 esperada confirma:

- loja e produto ativos aparecem em `/lojas/[slug]`;
- adicionar pelo botão do catálogo cria carrinho local real, sem semear `localStorage` manualmente;
- o checkout redireciona para login quando necessário e retorna a `/checkout` após login CUSTOMER;
- CASH fica habilitado e selecionado; PIX/cartão ficam indisponíveis e não geram provider fake;
- a criação do pedido leva a `/pedido/[publicCode]`;
- a página pública mostra status recebido, itens, totais e pagamento em dinheiro sem IDs internos, segredos, PIX copy-paste, metadados de cartão, payloads de provider ou stack traces;
- asserções no PostgreSQL confirmam pedido `PENDING`, pagamento `MANUAL_CASH_ON_DELIVERY`, um item, totais recalculados e histórico inicial.

## Solução de problemas

- **`DATABASE_URL` ausente**: preencha o `.env` local com um banco descartável. Comandos de migração, seed, smokes, `npm run verify:m001` e `npm run verify:m002` precisam de banco real.
- **Configuração de autenticação inválida**: use `AUTH_SECRET` aleatório com pelo menos 32 caracteres, `SESSION_COOKIE_NAME` compatível com cookie HTTP e `SESSION_MAX_AGE_DAYS` entre 1 e 365.
- **Seed falhou**: confirme `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. O seed não cria credenciais padrão silenciosas.
- **Chromium ausente no Playwright**: rode `npx playwright install chromium` e repita `npm run e2e:m002` ou `npm run verify:m002`.
- **Servidor Playwright não subiu**: confira se `NEXT_PUBLIC_APP_URL`/`PLAYWRIGHT_BASE_URL` apontam para a porta local esperada e se não há outro processo ocupando a porta.
- **Uploads indisponíveis**: confirme `UPLOAD_DRIVER="local"`, diretório com permissão de escrita, base pública coerente com `/uploads` e limite de bytes positivo.
- **Build ou lint falhou**: corrija o erro local antes de rodar `npm run verify:m001` ou `npm run verify:m002` novamente.
- **Rota privada redirecionou para acesso negado**: entre com o perfil correto para a área desejada; os guards validam sessão e papel no servidor.

## Deferrals conhecidos

As próximas entregas ainda precisam definir transições de status pelo estabelecimento, gateway real de PIX/cartão, assinaturas/cobrança mensal, armazenamento S3/R2/MinIO, deploy final/PWA instalável, observabilidade centralizada, limites/rate limiting e integrações externas. Até lá, mantenha placeholders futuros em `.env.example` e não conecte integrações reais sem novo contrato de ambiente e verificação.
