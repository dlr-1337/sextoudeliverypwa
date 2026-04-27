# Sextou Delivery PWA

Sextou Delivery é uma base Next.js para delivery local. Este guia é para uma pessoa engenheira interna ou agente que acabou de clonar o projeto e precisa levantar uma instância local segura, com banco descartável, seed inicial e verificação M001 completa.

## O que o M001 entrega

O M001 é a fundação operacional do produto:

- aplicativo Next.js com rotas públicas, privadas e feedbacks seguros em português;
- PostgreSQL com Prisma, migrações versionadas e seed idempotente;
- autenticação por e-mail e senha, sessão httpOnly e guards por perfil;
- cadastro de consumidores e estabelecimentos;
- área administrativa para dashboard, categorias, clientes e estabelecimentos;
- painel do estabelecimento com perfil, uploads locais, produtos e ciclo de vida;
- catálogo público que mostra apenas lojas aprovadas/ativas e produtos ativos;
- comandos de smoke e verificação final para reexecutar S01 a S05 sem reset destrutivo.

Fora do M001, por enquanto: carrinho, pedidos, checkout, gateway de pagamentos real, assinaturas, storage S3/R2/MinIO em produção, deploy/PWA final, métricas centralizadas e rate limiting.

Para revisar a cobertura requisito por requisito, consulte [`docs/m001-requirements-coverage.md`](docs/m001-requirements-coverage.md), que separa R001–R016 entregues no M001 de R017–R043 downstream, diferidos ou no-go.

## Pré-requisitos

- Node.js 20.19 ou superior.
- npm compatível com o lockfile do projeto.
- PostgreSQL acessível localmente ou em ambiente descartável.
- Um banco de dados de desenvolvimento que possa receber migrações e dados de seed.
- Permissão de escrita no diretório local de uploads configurado.

Nunca aponte os comandos de desenvolvimento para um banco com dados reais de produção.

## Configuração de ambiente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para um arquivo `.env` local e não versionado.
3. Substitua todos os placeholders de segredo por valores reais somente no `.env` local.
4. Confira os grupos ativos no M001:
   - aplicação: URL pública local e ambiente;
   - PostgreSQL: `DATABASE_URL` para comandos que tocam o banco;
   - autenticação e sessão: segredo, nome do cookie e expiração;
   - seed: credenciais iniciais do administrador local;
   - upload local: driver, pasta, URL pública e limite de bytes.
5. Mantenha os grupos de S3/R2/MinIO e pagamentos fake/dev como placeholders até as slices futuras definirem esses contratos.

`.env.example` é seguro para commit e deve continuar sem segredos reais. `.env` fica ignorado pelo git.

## PostgreSQL, Prisma e seed

Use um banco PostgreSQL descartável para desenvolvimento. A URL deve seguir o formato do provedor PostgreSQL e ficar somente no `.env` local.

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

- `/` — visão pública da fundação M001;
- `/login` — entrada por e-mail e senha;
- `/cadastro` — cadastro de consumidor ou estabelecimento;
- `/conta` — área protegida do consumidor;
- `/admin` — dashboard administrativo;
- `/admin/estabelecimentos` — gestão de estabelecimentos;
- `/admin/categorias` — gestão de categorias;
- `/admin/clientes` — consulta administrativa de clientes;
- `/estabelecimento` — painel privado do lojista;
- `/lojas` — catálogo público de lojas ativas;
- `/lojas/[slug]` — catálogo público de uma loja ativa;
- `/acesso-negado` — feedback seguro para rotas privadas recusadas;
- `/uploads/...` — leitura pública de imagens geradas pelo upload local.

## Upload local

O M001 suporta apenas `UPLOAD_DRIVER="local"`. Os arquivos são gravados no diretório de runtime definido por `UPLOAD_DIR`, com padrão `./uploads`, e são servidos a partir de `UPLOAD_PUBLIC_BASE_URL`.

Regras importantes:

- `UPLOAD_PUBLIC_BASE_URL` deve apontar para uma URL HTTP/HTTPS sem query/hash ou para um caminho raiz como `/uploads`.
- `UPLOAD_MAX_BYTES` é um inteiro positivo em bytes; o exemplo usa 5 MiB.
- Somente imagens PNG, JPEG/JPG e WebP são aceitas, validadas pelo conteúdo do arquivo.
- Nomes finais são gerados pelo servidor; nomes originais enviados pelo usuário não devem aparecer em logs ou URLs persistidas.
- `uploads/` é runtime local e fica ignorado pelo git.

## Verificação final do M001

Quando o ambiente estiver apontando para um banco descartável e o seed estiver preenchido, rode:

```bash
npm run verify:m001
```

O comando executa, nesta ordem: `npm run db:generate`, `npm test`, `npm run lint`, `npm run build`, `npm run db:deploy`, `npm run db:seed` e `npm run smoke:m001`.

Para isolar problemas nos smokes integrados, rode:

```bash
npm run smoke:m001
```

Os smokes S01–S05 devem imprimir apenas rótulos seguros, booleans e contagens. Não registre URLs de banco, tokens de sessão, hashes de senha, segredos de seed, caminhos absolutos de upload ou nomes originais de arquivos.

## Solução de problemas

- **`DATABASE_URL` ausente**: preencha o `.env` local. Comandos de migração, seed, smokes e `npm run verify:m001` precisam de banco real.
- **Configuração de autenticação inválida**: use `AUTH_SECRET` aleatório com pelo menos 32 caracteres, `SESSION_COOKIE_NAME` compatível com cookie HTTP e `SESSION_MAX_AGE_DAYS` entre 1 e 365.
- **Seed falhou**: confirme `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. O seed não cria credenciais padrão silenciosas.
- **Uploads indisponíveis**: confirme `UPLOAD_DRIVER="local"`, diretório com permissão de escrita, base pública coerente com `/uploads` e limite de bytes positivo.
- **Build ou lint falhou**: corrija o erro local antes de rodar `npm run verify:m001` novamente.
- **Rota privada redirecionou para acesso negado**: entre com o perfil correto para a área desejada; os guards validam sessão e papel no servidor.

## Deferrals conhecidos

As próximas entregas ainda precisam definir carrinho, pedidos, checkout, gateway de pagamentos real, assinaturas, armazenamento S3/R2/MinIO, deploy final/PWA instalável, observabilidade centralizada e limites/rate limiting. Até lá, mantenha placeholders futuros em `.env.example` e não conecte integrações reais sem novo contrato de ambiente e verificação.
