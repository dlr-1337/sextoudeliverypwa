# Plano completo de implementação - MVP Plataforma de Delivery

**Destino:** Codex / agente implementador  
**Produto final desta fase:** MVP operacional de delivery de bebidas, petiscos e churrascos  
**Modelo de entrega:** PWA do consumidor + painel web do estabelecimento + painel web administrativo  
**Regra principal:** implementar apenas o que está neste documento. Não adicionar módulos fora do escopo.

---

## 0. Instrução inicial para o Codex

Você é o agente implementador deste MVP. Implemente uma plataforma web responsiva de delivery, com três áreas principais:

1. **Consumidor:** PWA responsivo para cadastro, login, listagem de estabelecimentos, catálogo, carrinho, checkout e acompanhamento textual do pedido.
2. **Estabelecimento:** painel web para gestão do próprio perfil operacional, produtos e pedidos recebidos.
3. **Administrador:** painel web para aprovar/bloquear/reativar estabelecimentos, consultar consumidores, acompanhar pedidos, manter categorias gerais e controlar mensalidades manualmente.

A entrega deve ser uma primeira versão operacional. Não criar aplicativo nativo, não criar módulo de entregador, não criar split de pagamentos, não criar recursos de marketing, não criar automações fora do escopo.

Sempre que houver dúvida entre implementar algo simples ou algo avançado, implemente a versão simples do MVP.

---

## 1. Escopo fechado do MVP

### 1.1 Incluído

- PWA responsivo para consumidor.
- Painel web do estabelecimento.
- Painel web administrativo.
- Backend necessário para autenticação, cadastros, catálogo, pedidos, pagamentos e mensalidades.
- Banco de dados relacional.
- Upload de imagem/logo do estabelecimento e foto principal do produto.
- Cadastro de três perfis:
  - administrador geral;
  - estabelecimento;
  - consumidor.
- Aprovação manual de estabelecimento pelo administrador.
- Bloqueio e reativação manual de estabelecimento pelo administrador.
- Cadastro, edição, ativação, desativação e exclusão de produtos pelo estabelecimento.
- Catálogo organizado por estabelecimento e categoria.
- Carrinho de compras para produtos de um único estabelecimento por pedido.
- Checkout com endereço de entrega, observação geral e forma de pagamento.
- Status textual do pedido.
- Atualização manual de status pelo estabelecimento.
- Histórico básico de pedidos.
- Meios de pagamento previstos:
  - PIX online via 1 gateway escolhido pelo cliente;
  - cartão online via 1 gateway escolhido pelo cliente;
  - dinheiro na entrega, sem processamento online.
- Pagamento online vinculado a 1 conta recebedora informada pelo cliente.
- Controle administrativo/manual da mensalidade do sistema por estabelecimento.
- Publicação em 1 ambiente de produção contratado pelo cliente.
- Testes básicos dos fluxos incluídos.

### 1.2 Fora do escopo

Não implementar nesta fase:

- aplicativo nativo Android/iOS;
- publicação na App Store ou Google Play;
- módulo de entregador;
- geolocalização de entregador;
- rastreio em tempo real;
- mapas, rotas ou prova de entrega;
- split de pagamento;
- múltiplas contas recebedoras;
- subcontas por estabelecimento;
- repasse automático;
- recorrência automática de mensalidade;
- emissão automática de boleto, fatura ou nota fiscal;
- cupons, promoções, cashback, fidelidade ou CRM;
- chat interno;
- WhatsApp automático;
- SMS;
- push notification;
- e-mail marketing;
- múltiplas fotos por produto;
- variações complexas;
- adicionais;
- combos;
- grade/SKU;
- estoque avançado;
- integração com ERP, balança ou NF-e;
- múltiplos usuários por estabelecimento;
- filiais;
- permissões por setor;
- importação em massa;
- migração de base antiga;
- dashboard executivo avançado;
- BI;
- relatórios complexos;
- API pública para terceiros;
- assessoria jurídica, termos de uso, política de privacidade ou LGPD avançada;
- automações regulatórias para produtos com exigência legal adicional.

---

## 2. Stack recomendada

Para entregar rápido, manter baixo custo e facilitar manutenção, usar uma aplicação full-stack única.

### 2.1 Frontend e backend

- **Next.js com App Router**
- **TypeScript**
- **React**
- **Tailwind CSS**
- **Componentes reutilizáveis próprios ou biblioteca de UI leve**
- **Server Actions e/ou API Routes** para operações protegidas
- **PWA** via manifesto e service worker simples

### 2.2 Banco e ORM

- **PostgreSQL** em produção.
- **Prisma ORM** para schema, migrations e consultas.
- SQLite apenas se for usado localmente em desenvolvimento; produção deve usar PostgreSQL.

### 2.3 Autenticação

- Login por e-mail e senha.
- Hash de senha com bcrypt/argon2.
- Sessão segura via cookies httpOnly.
- Controle de acesso por papel de usuário:
  - `ADMIN`
  - `MERCHANT`
  - `CUSTOMER`

### 2.4 Uploads

- Desenvolvimento: armazenamento local em `/public/uploads`, se necessário.
- Produção: preferir storage persistente compatível com S3, Supabase Storage, Cloudinary ou equivalente.
- Não depender de filesystem efêmero em ambiente serverless.

### 2.5 Pagamento

- Criar uma camada de abstração de gateway.
- Implementar apenas 1 gateway real escolhido e contratado pelo cliente.
- Não armazenar dados sensíveis de cartão.
- Usar checkout hospedado, tokenização ou SDK oficial do provedor escolhido.
- Criar webhook para confirmação de pagamento.
- Dinheiro deve ser tratado como pagamento manual na entrega.

### 2.6 Deploy

- Ambiente único de produção.
- Banco PostgreSQL provisionado pelo cliente.
- Domínio e SSL fornecidos/configurados no ambiente do cliente.
- Variáveis de ambiente documentadas.

---

## 3. Arquitetura geral

```txt
[Consumidor - PWA]
        |
        | HTTPS
        v
[Next.js App]
        |
        | Prisma
        v
[PostgreSQL]

[Estabelecimento - Painel Web] -> [Next.js App] -> [PostgreSQL]
[Administrador - Painel Web]   -> [Next.js App] -> [PostgreSQL]

[Next.js App] -> [Storage de imagens]
[Next.js App] -> [Gateway escolhido]
[Gateway escolhido] -> [Webhook de pagamento] -> [Next.js App]
```

### 3.1 Separação lógica

```txt
/src
  /app
    /(public)
    /(auth)
    /(customer)
    /(merchant)
    /(admin)
    /api
  /components
  /lib
  /server
  /modules
  /styles
/prisma
/public
```

### 3.2 Módulos principais

```txt
modules/
  auth/
  users/
  establishments/
  categories/
  products/
  cart/
  orders/
  payments/
  monthly-billings/
  uploads/
  admin/
  merchant/
  customer/
```

---

## 4. Estrutura de rotas web

### 4.1 Rotas públicas

```txt
/
/login
/cadastro
/cadastro/consumidor
/cadastro/estabelecimento
/lojas
/lojas/[slug]
/pedido/[publicCode]
```

### 4.2 Rotas do consumidor

```txt
/app
/app/pedidos
/app/pedidos/[publicCode]
/app/perfil
/checkout
/checkout/confirmacao/[publicCode]
```

### 4.3 Rotas do estabelecimento

```txt
/estabelecimento
/estabelecimento/perfil
/estabelecimento/produtos
/estabelecimento/produtos/novo
/estabelecimento/produtos/[id]/editar
/estabelecimento/pedidos
/estabelecimento/pedidos/[id]
```

### 4.4 Rotas administrativas

```txt
/admin
/admin/estabelecimentos
/admin/estabelecimentos/[id]
/admin/consumidores
/admin/pedidos
/admin/pedidos/[id]
/admin/categorias
/admin/mensalidades
/admin/mensalidades/nova
/admin/mensalidades/[id]
```

---

## 5. Modelagem do banco de dados

Usar o schema abaixo como base inicial do Prisma. Ajustes pequenos são permitidos se forem necessários para compatibilidade técnica, mas não ampliar escopo funcional.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  ADMIN
  MERCHANT
  CUSTOMER
}

enum UserStatus {
  ACTIVE
  BLOCKED
}

enum EstablishmentStatus {
  PENDING
  ACTIVE
  BLOCKED
  INACTIVE
}

enum CategoryType {
  ESTABLISHMENT
  PRODUCT
}

enum ProductStatus {
  ACTIVE
  INACTIVE
}

enum OrderStatus {
  PENDING
  ACCEPTED
  PREPARING
  OUT_FOR_DELIVERY
  DELIVERED
  REJECTED
  CANCELLED
}

enum PaymentMethod {
  PIX
  CARD
  CASH
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  CANCELLED
  MANUAL_CASH_ON_DELIVERY
}

enum MonthlyBillingStatus {
  OPEN
  PAID
  OVERDUE
}

model User {
  id           String     @id @default(cuid())
  name         String
  email        String     @unique
  phone        String?
  passwordHash String
  role         UserRole
  status       UserStatus @default(ACTIVE)

  establishment       Establishment?
  customerOrders      Order[]              @relation("CustomerOrders")
  orderStatusChanges  OrderStatusHistory[] @relation("OrderStatusChangedBy")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([role])
  @@index([status])
}

model Category {
  id        String       @id @default(cuid())
  name      String
  slug      String
  type      CategoryType
  isActive  Boolean      @default(true)
  sortOrder Int          @default(0)

  establishments Establishment[]
  products       Product[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([slug, type])
  @@index([type, isActive])
}

model Establishment {
  id        String              @id @default(cuid())
  ownerId   String              @unique
  owner     User                @relation(fields: [ownerId], references: [id])

  name              String
  slug              String              @unique
  categoryId        String?
  category          Category?           @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  contactPhone      String?
  contactEmail      String?
  addressLine       String
  addressNumber     String?
  addressComplement String?
  neighborhood      String?
  city              String
  region            String?
  state             String?
  postalCode        String?
  openingHoursText  String?
  logoUrl           String?
  status            EstablishmentStatus @default(PENDING)
  monthlyFeeAmount  Decimal?            @db.Decimal(10, 2)

  products        Product[]
  orders          Order[]
  monthlyBillings MonthlyBilling[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([city, region])
  @@index([categoryId])
}

model Product {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  name             String
  slug             String
  shortDescription String?
  price            Decimal       @db.Decimal(10, 2)
  imageUrl         String?
  status           ProductStatus @default(ACTIVE)

  orderItems OrderItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([establishmentId, slug])
  @@index([establishmentId, status])
  @@index([categoryId])
}

model Order {
  id              String        @id @default(cuid())
  publicCode      String        @unique
  customerId      String
  customer        User          @relation("CustomerOrders", fields: [customerId], references: [id])
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id])

  customerName  String
  customerPhone String?

  deliveryAddressLine       String
  deliveryAddressNumber     String?
  deliveryAddressComplement String?
  deliveryNeighborhood      String?
  deliveryCity              String
  deliveryRegion            String?
  deliveryState             String?
  deliveryPostalCode        String?

  generalObservation String?

  status        OrderStatus   @default(PENDING)
  paymentMethod PaymentMethod
  paymentStatus PaymentStatus @default(PENDING)

  subtotal Decimal @db.Decimal(10, 2)
  total    Decimal @db.Decimal(10, 2)

  items         OrderItem[]
  statusHistory OrderStatusHistory[]
  payment       Payment?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([customerId])
  @@index([establishmentId, status])
  @@index([paymentStatus])
  @@index([createdAt])
}

model OrderItem {
  id        String @id @default(cuid())
  orderId   String
  order     Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  productId String?
  product   Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  productName String
  unitPrice   Decimal @db.Decimal(10, 2)
  quantity    Int
  total       Decimal @db.Decimal(10, 2)

  createdAt DateTime @default(now())

  @@index([orderId])
  @@index([productId])
}

model OrderStatusHistory {
  id      String      @id @default(cuid())
  orderId String
  order   Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status  OrderStatus

  changedById String?
  changedBy   User?   @relation("OrderStatusChangedBy", fields: [changedById], references: [id], onDelete: SetNull)

  note      String?
  createdAt DateTime @default(now())

  @@index([orderId])
  @@index([status])
}

model Payment {
  id      String @id @default(cuid())
  orderId String @unique
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  method            PaymentMethod
  status            PaymentStatus @default(PENDING)
  amount            Decimal       @db.Decimal(10, 2)
  provider          String?
  providerPaymentId String?
  checkoutUrl       String?
  pixQrCodeUrl      String?
  pixCopyPaste      String?
  providerPayload   Json?
  paidAt            DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([provider, providerPaymentId])
}

model MonthlyBilling {
  id              String        @id @default(cuid())
  establishmentId String
  establishment   Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)

  competence String // formato YYYY-MM
  dueDate    DateTime
  amount     Decimal              @db.Decimal(10, 2)
  status     MonthlyBillingStatus @default(OPEN)
  paidAt     DateTime?
  notes      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([establishmentId, competence])
  @@index([status])
  @@index([dueDate])
}
```

---

## 6. Variáveis de ambiente

Criar `.env.example` com:

```env
# App
APP_NAME="Plataforma Delivery"
APP_URL="http://localhost:3000"
NODE_ENV="development"

# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"

# Auth
AUTH_SECRET="trocar-em-producao"
SESSION_COOKIE_NAME="delivery_session"

# Seed admin
SEED_ADMIN_NAME="Administrador"
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="trocar-em-producao"

# Uploads
UPLOAD_DRIVER="local"
UPLOAD_MAX_SIZE_MB="2"
UPLOAD_ALLOWED_MIME_TYPES="image/jpeg,image/png,image/webp"
S3_ENDPOINT=""
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE_URL=""

# Payment gateway
PAYMENT_GATEWAY="GATEWAY_ESCOLHIDO"
PAYMENT_RECEIVER_ACCOUNT=""
PAYMENT_WEBHOOK_SECRET=""
PAYMENT_SUCCESS_URL="http://localhost:3000/checkout/confirmacao/{publicCode}"
PAYMENT_CANCEL_URL="http://localhost:3000/checkout/{publicCode}"

# Gateway escolhido - preencher conforme provedor real
GATEWAY_API_KEY=""
GATEWAY_SECRET_KEY=""
GATEWAY_ENV="sandbox"
```

---

## 7. Regras de autenticação e autorização

### 7.1 Usuário administrador

Pode:

- acessar `/admin`;
- listar estabelecimentos;
- aprovar estabelecimento;
- bloquear estabelecimento;
- reativar estabelecimento;
- consultar consumidores;
- consultar pedidos;
- criar, editar, ativar e inativar categorias gerais;
- cadastrar mensalidades;
- alterar status de mensalidades;
- definir valor mensal de um estabelecimento.

Não precisa nesta fase:

- múltiplos administradores com permissões diferentes;
- auditoria avançada;
- logs detalhados.

### 7.2 Usuário estabelecimento

Pode:

- acessar `/estabelecimento` somente se tiver role `MERCHANT`;
- editar dados básicos do próprio estabelecimento;
- cadastrar produto;
- editar produto;
- ativar/inativar produto;
- excluir produto;
- ver pedidos do próprio estabelecimento;
- alterar status dos pedidos do próprio estabelecimento.

Regras:

- cada estabelecimento terá apenas 1 login gestor;
- um estabelecimento não pode ver dados de outro estabelecimento;
- estabelecimento pendente ou bloqueado não pode vender;
- estabelecimento bloqueado pode acessar painel apenas para ver aviso de bloqueio, se desejado, mas não deve vender nem receber novos pedidos.

### 7.3 Usuário consumidor

Pode:

- acessar catálogo de estabelecimentos ativos;
- criar conta;
- fazer login;
- montar carrinho com produtos de um único estabelecimento;
- finalizar pedido;
- selecionar forma de pagamento;
- acompanhar status textual do pedido;
- ver histórico básico dos próprios pedidos.

Não implementar:

- login social;
- carteira;
- cashback;
- favoritos;
- avaliações;
- comentários;
- endereços múltiplos avançados.

---

## 8. API / Server Actions

As rotas abaixo podem ser implementadas como API Routes, Route Handlers ou Server Actions. O importante é manter validação, autorização e transações.

### 8.1 Auth

```txt
POST /api/auth/register/customer
POST /api/auth/register/merchant
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Validações:

- e-mail obrigatório e único;
- senha com no mínimo 8 caracteres;
- nome obrigatório;
- role não deve ser aceita livremente pelo frontend;
- cadastro de consumidor cria `User` com role `CUSTOMER`;
- cadastro de estabelecimento cria `User` com role `MERCHANT` e `Establishment` com status `PENDING`.

### 8.2 Estabelecimentos públicos

```txt
GET /api/establishments
GET /api/establishments/[slug]
```

Regras:

- retornar somente estabelecimentos `ACTIVE`;
- permitir filtro opcional por cidade/região;
- não exibir estabelecimentos `PENDING`, `BLOCKED` ou `INACTIVE` para consumidores.

### 8.3 Admin - estabelecimentos

```txt
GET   /api/admin/establishments
GET   /api/admin/establishments/[id]
PATCH /api/admin/establishments/[id]/approve
PATCH /api/admin/establishments/[id]/block
PATCH /api/admin/establishments/[id]/reactivate
PATCH /api/admin/establishments/[id]/inactivate
PATCH /api/admin/establishments/[id]/monthly-fee
```

Regras:

- apenas `ADMIN`;
- aprovar muda status para `ACTIVE`;
- bloquear muda status para `BLOCKED`;
- reativar muda status para `ACTIVE`;
- inativar muda status para `INACTIVE`;
- valor de mensalidade fica em `Establishment.monthlyFeeAmount`.

### 8.4 Admin - consumidores

```txt
GET /api/admin/customers
GET /api/admin/customers/[id]
```

Regras:

- apenas consulta simples;
- não implementar CRM.

### 8.5 Categorias

```txt
GET    /api/categories
GET    /api/admin/categories
POST   /api/admin/categories
PATCH  /api/admin/categories/[id]
DELETE /api/admin/categories/[id]
```

Regras:

- categorias são gerais da plataforma;
- tipos: `ESTABLISHMENT` e `PRODUCT`;
- `DELETE` pode ser exclusão lógica, alterando `isActive = false`, para evitar quebra de histórico.

### 8.6 Produtos do estabelecimento

```txt
GET    /api/merchant/products
POST   /api/merchant/products
GET    /api/merchant/products/[id]
PATCH  /api/merchant/products/[id]
DELETE /api/merchant/products/[id]
PATCH  /api/merchant/products/[id]/activate
PATCH  /api/merchant/products/[id]/deactivate
```

Regras:

- apenas `MERCHANT`;
- só manipula produtos do próprio estabelecimento;
- produto deve ter nome, preço e status;
- foto principal opcional, mas funcionalidade de upload deve existir;
- preço não pode ser negativo;
- produto inativo não aparece no catálogo público;
- exclusão pode ser hard delete se não quebrar pedidos antigos; caso contrário, usar soft delete/inativação.

### 8.7 Uploads

```txt
POST /api/uploads/establishment-logo
POST /api/uploads/product-image
```

Regras:

- exigir usuário autenticado;
- merchant só pode subir imagem para o próprio estabelecimento/produto;
- admin pode gerenciar se necessário;
- aceitar apenas JPG, PNG e WEBP;
- limitar tamanho do arquivo;
- retornar URL pública segura;
- não aceitar arquivos executáveis.

### 8.8 Pedidos

```txt
POST /api/orders
GET  /api/orders/[publicCode]
GET  /api/customer/orders
GET  /api/customer/orders/[publicCode]
GET  /api/merchant/orders
GET  /api/merchant/orders/[id]
PATCH /api/merchant/orders/[id]/status
GET  /api/admin/orders
GET  /api/admin/orders/[id]
```

Regras de criação de pedido:

1. usuário deve estar autenticado como `CUSTOMER`;
2. estabelecimento deve existir e estar `ACTIVE`;
3. todos os itens devem pertencer ao mesmo estabelecimento;
4. todos os produtos devem estar `ACTIVE`;
5. calcular preço no backend com base nos valores atuais do banco;
6. criar snapshot dos itens em `OrderItem`;
7. criar `Order` com status `PENDING`;
8. criar primeiro registro em `OrderStatusHistory`;
9. criar `Payment` conforme forma escolhida;
10. usar transação de banco.

### 8.9 Status de pedido

Fluxo permitido:

```txt
PENDING -> ACCEPTED
PENDING -> REJECTED
PENDING -> CANCELLED
ACCEPTED -> PREPARING
ACCEPTED -> CANCELLED
PREPARING -> OUT_FOR_DELIVERY
PREPARING -> CANCELLED
OUT_FOR_DELIVERY -> DELIVERED
OUT_FOR_DELIVERY -> CANCELLED
```

Regras:

- estabelecimento só altera pedidos próprios;
- admin pode consultar, mas não precisa alterar status operacional no MVP;
- consumidor só visualiza status;
- toda alteração grava histórico.

### 8.10 Pagamentos

```txt
POST /api/payments/orders/[orderId]/initiate
POST /api/payments/webhooks/[provider]
GET  /api/payments/orders/[orderId]
```

Regras:

- `CASH`: marcar `Payment.status = MANUAL_CASH_ON_DELIVERY`; não chamar gateway.
- `PIX`: criar pagamento no gateway escolhido e salvar QR Code/copia-e-cola se o provedor retornar.
- `CARD`: usar checkout hospedado/tokenização oficial do gateway escolhido.
- webhook deve validar assinatura/segredo quando o provedor suportar;
- webhook atualiza `Payment.status` e `Order.paymentStatus`;
- não implementar split;
- não implementar subcontas;
- não implementar recorrência.

### 8.11 Mensalidades

```txt
GET   /api/admin/monthly-billings
POST  /api/admin/monthly-billings
GET   /api/admin/monthly-billings/[id]
PATCH /api/admin/monthly-billings/[id]
PATCH /api/admin/monthly-billings/[id]/mark-paid
PATCH /api/admin/monthly-billings/[id]/mark-open
PATCH /api/admin/monthly-billings/[id]/mark-overdue
```

Regras:

- apenas `ADMIN`;
- cadastro manual de competência, vencimento, valor e status;
- status possíveis: `OPEN`, `PAID`, `OVERDUE`;
- bloqueio/reativação do estabelecimento continua sendo manual;
- não criar cobrança recorrente automática;
- não emitir boleto/fatura/nota automaticamente.

---

## 9. Telas e componentes

### 9.1 Componentes globais

```txt
components/
  AppHeader.tsx
  AppFooter.tsx
  Logo.tsx
  Button.tsx
  Input.tsx
  Select.tsx
  Textarea.tsx
  Card.tsx
  Badge.tsx
  Modal.tsx
  ConfirmDialog.tsx
  EmptyState.tsx
  LoadingState.tsx
  ErrorState.tsx
  Price.tsx
  StatusBadge.tsx
  ImageUpload.tsx
```

### 9.2 Layout público / consumidor

#### Home `/`

Conteúdo:

- nome da plataforma;
- chamada simples;
- botão para ver lojas;
- botão para login/cadastro;
- destaque de que é PWA responsivo.

#### Listagem de lojas `/lojas`

Conteúdo:

- lista de estabelecimentos ativos;
- filtro simples por cidade/região, se houver dados;
- card com logo, nome, categoria, cidade/região e status aberto textual baseado no horário informado;
- clique abre `/lojas/[slug]`.

Não implementar busca avançada, favoritos ou recomendação.

#### Catálogo da loja `/lojas/[slug]`

Conteúdo:

- cabeçalho da loja;
- logo;
- categoria;
- contato;
- endereço principal;
- horário de funcionamento textual;
- produtos agrupados por categoria;
- card de produto com foto, nome, descrição curta, preço e botão adicionar;
- carrinho persistido no client para aquela loja.

Regra crítica:

- o carrinho só pode conter itens de um único estabelecimento;
- ao tentar adicionar produto de outra loja, pedir confirmação para limpar o carrinho anterior.

#### Carrinho

Conteúdo:

- itens;
- quantidade;
- preço unitário;
- subtotal;
- remover item;
- alterar quantidade;
- botão finalizar pedido.

#### Checkout `/checkout`

Campos:

- nome do consumidor preenchido pelo cadastro;
- telefone;
- endereço de entrega;
- número;
- complemento;
- bairro;
- cidade;
- região;
- estado;
- CEP;
- observação geral;
- forma de pagamento: PIX, cartão, dinheiro;
- resumo do pedido;
- botão confirmar pedido.

#### Confirmação `/checkout/confirmacao/[publicCode]`

Conteúdo:

- número público do pedido;
- status do pedido;
- status do pagamento;
- se PIX: mostrar QR Code e copia-e-cola quando disponível;
- se cartão: mostrar link/botão para checkout do gateway se aplicável;
- se dinheiro: informar pagamento na entrega;
- link para acompanhar pedido.

#### Acompanhamento `/pedido/[publicCode]`

Conteúdo:

- dados básicos do pedido;
- status atual;
- histórico textual de status;
- itens do pedido;
- forma/status de pagamento.

### 9.3 Painel do estabelecimento

#### Dashboard `/estabelecimento`

Conteúdo simples:

- status do estabelecimento;
- aviso se pendente/bloqueado;
- total de pedidos recentes;
- atalhos para produtos e pedidos.

#### Perfil `/estabelecimento/perfil`

Campos:

- nome;
- contato;
- endereço principal;
- cidade/região;
- horário de funcionamento textual;
- logo.

Observação:

- se o estabelecimento estiver pendente, mostrar aviso de que depende de aprovação do administrador.

#### Produtos `/estabelecimento/produtos`

Conteúdo:

- tabela/lista de produtos;
- filtros simples por status e categoria;
- botão novo produto;
- ações: editar, ativar, inativar, excluir.

#### Novo/editar produto

Campos:

- nome;
- categoria;
- descrição curta;
- preço;
- foto principal;
- status ativo/inativo.

#### Pedidos `/estabelecimento/pedidos`

Conteúdo:

- lista de pedidos do próprio estabelecimento;
- filtros por status;
- visualização de data, código, cliente, total, pagamento e status;
- botão ver detalhes.

#### Detalhe do pedido `/estabelecimento/pedidos/[id]`

Conteúdo:

- dados do consumidor;
- endereço de entrega;
- observação;
- itens;
- total;
- forma/status de pagamento;
- status atual;
- botões de transição permitida de status.

### 9.4 Painel administrativo

#### Dashboard `/admin`

Conteúdo simples:

- total de estabelecimentos pendentes;
- total de estabelecimentos ativos;
- total de pedidos recentes;
- total de mensalidades em aberto/vencidas;
- atalhos para módulos.

Não criar BI avançado.

#### Estabelecimentos `/admin/estabelecimentos`

Conteúdo:

- tabela com nome, cidade/região, categoria, status e data de cadastro;
- filtros por status;
- ações: ver, aprovar, bloquear, reativar, inativar.

#### Detalhe do estabelecimento `/admin/estabelecimentos/[id]`

Conteúdo:

- dados completos;
- status;
- produtos resumidos;
- pedidos resumidos;
- valor mensalidade;
- botões de status;
- campo para atualizar mensalidade.

#### Consumidores `/admin/consumidores`

Conteúdo:

- lista simples de consumidores cadastrados;
- nome, e-mail, telefone, data de cadastro;
- detalhe com histórico básico de pedidos.

#### Pedidos `/admin/pedidos`

Conteúdo:

- lista geral de pedidos;
- filtros por estabelecimento, status e data;
- detalhe somente consulta.

#### Categorias `/admin/categorias`

Conteúdo:

- categorias de estabelecimento e produto;
- criar;
- editar;
- ativar/inativar.

#### Mensalidades `/admin/mensalidades`

Conteúdo:

- tabela com estabelecimento, competência, vencimento, valor e status;
- criar cobrança manual;
- marcar como pago;
- marcar como em aberto;
- marcar como vencido;
- link para bloquear/reativar estabelecimento manualmente.

---

## 10. Fluxos funcionais completos

### 10.1 Cadastro de estabelecimento

1. Usuário acessa `/cadastro/estabelecimento`.
2. Preenche dados do login:
   - nome do responsável;
   - e-mail;
   - telefone;
   - senha.
3. Preenche dados do estabelecimento:
   - nome;
   - categoria;
   - contato;
   - endereço;
   - cidade/região;
   - horário de funcionamento textual;
   - logo opcional.
4. Backend cria `User` com role `MERCHANT`.
5. Backend cria `Establishment` com status `PENDING`.
6. Sistema mostra mensagem: cadastro recebido e aguardando aprovação.
7. Admin acessa `/admin/estabelecimentos`.
8. Admin aprova.
9. Estabelecimento muda para `ACTIVE`.
10. Loja passa a aparecer para consumidores.

### 10.2 Cadastro de consumidor

1. Usuário acessa `/cadastro/consumidor`.
2. Informa nome, e-mail, telefone e senha.
3. Backend cria `User` com role `CUSTOMER`.
4. Usuário faz login.
5. Pode comprar em estabelecimentos ativos.

### 10.3 Cadastro de produto

1. Estabelecimento logado acessa `/estabelecimento/produtos/novo`.
2. Preenche nome, categoria, descrição curta, preço, foto e status.
3. Backend valida propriedade do estabelecimento.
4. Produto é salvo.
5. Se status `ACTIVE`, aparece no catálogo público da loja ativa.

### 10.4 Pedido do consumidor

1. Consumidor acessa `/lojas`.
2. Escolhe uma loja ativa.
3. Visualiza produtos ativos.
4. Adiciona produtos ao carrinho.
5. Vai para checkout.
6. Informa endereço, observação e forma de pagamento.
7. Backend valida produtos e recalcula preço.
8. Backend cria pedido e itens em transação.
9. Backend cria registro de pagamento.
10. Consumidor recebe código público do pedido.
11. Estabelecimento vê pedido como `PENDING`.

### 10.5 Pagamento em dinheiro

1. Consumidor seleciona `CASH`.
2. Backend cria pedido.
3. Backend cria pagamento com status `MANUAL_CASH_ON_DELIVERY`.
4. Nenhum gateway é chamado.
5. Estabelecimento prossegue manualmente com o pedido.

### 10.6 Pagamento PIX

1. Consumidor seleciona `PIX`.
2. Backend cria pedido.
3. Backend chama gateway escolhido.
4. Gateway retorna dados de pagamento.
5. Backend salva `providerPaymentId`, QR Code/copia-e-cola se disponível e status `PENDING`.
6. Consumidor visualiza instruções de pagamento.
7. Gateway chama webhook.
8. Backend valida webhook.
9. Backend atualiza pagamento para `PAID` quando confirmado.
10. Pedido mostra pagamento confirmado.

### 10.7 Pagamento cartão

1. Consumidor seleciona `CARD`.
2. Backend cria pedido.
3. Backend chama gateway escolhido.
4. Usar checkout hospedado, link seguro ou tokenização oficial.
5. Consumidor é direcionado para confirmação/pagamento conforme gateway.
6. Webhook confirma ou recusa.
7. Backend atualiza `Payment.status` e `Order.paymentStatus`.

### 10.8 Operação do pedido

1. Pedido entra como `PENDING`.
2. Estabelecimento decide aceitar ou recusar.
3. Se aceitar: `ACCEPTED`.
4. Depois: `PREPARING`.
5. Depois: `OUT_FOR_DELIVERY`.
6. Depois: `DELIVERED`.
7. Consumidor vê somente status textual.
8. Histórico é gravado a cada alteração.

### 10.9 Controle de mensalidade

1. Admin acessa `/admin/mensalidades`.
2. Cria mensalidade manualmente:
   - estabelecimento;
   - competência;
   - vencimento;
   - valor;
   - status.
3. Admin marca como pago, em aberto ou vencido.
4. Se necessário, admin bloqueia o estabelecimento manualmente.
5. Se necessário, admin reativa manualmente.

---

## 11. Camada de pagamento

Criar módulo:

```txt
src/modules/payments/
  payment.types.ts
  payment.service.ts
  payment-gateway.interface.ts
  providers/
    selected-gateway.provider.ts
    fake-dev.provider.ts
  webhooks/
    payment-webhook.service.ts
```

### 11.1 Interface mínima

```ts
export type PaymentGatewayMethod = "PIX" | "CARD";

export type CreatePaymentInput = {
  orderId: string;
  publicCode: string;
  amount: number;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  successUrl: string;
  cancelUrl: string;
};

export type CreatePaymentOutput = {
  provider: string;
  providerPaymentId: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  checkoutUrl?: string;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  rawPayload?: unknown;
};

export type ParsedPaymentWebhook = {
  provider: string;
  providerPaymentId: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  rawPayload: unknown;
};

export interface PaymentGatewayProvider {
  createPixPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>;
  createCardPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>;
  parseAndValidateWebhook(input: {
    headers: Headers;
    body: unknown;
  }): Promise<ParsedPaymentWebhook>;
}
```

### 11.2 Regras de implementação

- O provider real deve ser implementado somente depois de definido o gateway do cliente.
- Enquanto o gateway real não estiver definido, usar `fake-dev.provider.ts` apenas para desenvolvimento local.
- Em produção, se `PAYMENT_GATEWAY` não estiver configurado corretamente, bloquear tentativa de pagamento online com erro claro.
- Não guardar dados de cartão no banco.
- Não implementar split.
- Não implementar subcontas.

---

## 12. PWA

### 12.1 Requisitos PWA

- Criar `manifest.webmanifest`.
- Definir nome da aplicação por variável ou configuração.
- Definir ícones básicos.
- Usar `display: standalone`.
- Definir tema visual básico.
- Criar service worker simples para cache de assets estáticos.
- Garantir responsividade em mobile.

### 12.2 Não implementar nesta fase

- push notification;
- offline checkout;
- sincronização offline;
- cache avançado de pedidos;
- recursos nativos.

### 12.3 Manifesto exemplo

```json
{
  "name": "Plataforma Delivery",
  "short_name": "Delivery",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111111",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 13. Validações principais

### 13.1 Usuário

- nome obrigatório;
- e-mail válido;
- e-mail único;
- senha mínima;
- usuário bloqueado não pode operar.

### 13.2 Estabelecimento

- nome obrigatório;
- cidade obrigatória;
- endereço obrigatório;
- status controlado pelo admin;
- slug único;
- só aparece publicamente se `ACTIVE`.

### 13.3 Produto

- nome obrigatório;
- preço obrigatório;
- preço maior ou igual a zero;
- status ativo/inativo;
- produto público somente se ativo e loja ativa;
- foto com tipo/tamanho permitido.

### 13.4 Pedido

- consumidor autenticado;
- estabelecimento ativo;
- itens do mesmo estabelecimento;
- quantidade maior que zero;
- preço calculado no backend;
- snapshot de nome e preço do produto;
- endereço de entrega obrigatório;
- forma de pagamento obrigatória;
- transição de status válida.

### 13.5 Mensalidade

- estabelecimento obrigatório;
- competência obrigatória no formato `YYYY-MM`;
- vencimento obrigatório;
- valor obrigatório;
- status válido;
- não duplicar competência para o mesmo estabelecimento.

---

## 14. Segurança mínima

Implementar:

- senha com hash forte;
- sessão por cookie httpOnly;
- proteção de rotas por role;
- validação server-side com schema;
- autorização por propriedade do recurso;
- tratamento de erro sem vazar segredo;
- variáveis sensíveis somente no servidor;
- webhook com validação de assinatura/secret quando disponível;
- limite de upload;
- validação de MIME real quando possível;
- proteção contra acesso cruzado entre estabelecimentos;
- impedir alteração de preço pelo cliente no checkout;
- impedir que usuário comum defina role no cadastro;
- logs básicos de erro no servidor.

Não implementar nesta fase:

- auditoria avançada;
- SIEM;
- antifraude personalizado;
- permissões administrativas refinadas;
- política jurídica completa.

---

## 15. Ordem de implementação para o Codex

### Etapa 1 - Bootstrap do projeto

Objetivo: criar estrutura base.

Tarefas:

1. Criar projeto Next.js com TypeScript.
2. Configurar Tailwind.
3. Configurar Prisma.
4. Configurar PostgreSQL via `DATABASE_URL`.
5. Criar `.env.example`.
6. Criar layout base.
7. Criar componentes básicos.
8. Criar estrutura de módulos.
9. Criar README inicial.

Critério de pronto:

- app roda localmente;
- página inicial renderiza;
- Prisma conecta no banco;
- migrations iniciais preparadas.

### Etapa 2 - Banco e seed

Objetivo: criar schema e dados iniciais.

Tarefas:

1. Implementar schema Prisma.
2. Criar migration inicial.
3. Criar seed de administrador via env.
4. Criar seed de categorias básicas:
   - Bebidas;
   - Petiscos;
   - Churrascos;
   - Outros.
5. Criar helpers de slug.
6. Criar helpers de dinheiro/decimal.

Critério de pronto:

- `prisma migrate` executa;
- `prisma db seed` cria admin;
- login admin será possível na etapa seguinte.

### Etapa 3 - Autenticação e autorização

Objetivo: login seguro e proteção de rotas.

Tarefas:

1. Implementar cadastro de consumidor.
2. Implementar cadastro de estabelecimento.
3. Implementar login.
4. Implementar logout.
5. Implementar recuperação de sessão atual.
6. Criar middleware/guards por role.
7. Bloquear acesso indevido a `/admin`, `/estabelecimento` e `/app`.
8. Criar telas de login/cadastro.

Critério de pronto:

- admin loga;
- consumidor cadastra e loga;
- estabelecimento cadastra e fica pendente;
- rotas protegidas funcionam.

### Etapa 4 - Admin base e categorias

Objetivo: painel administrativo operacional.

Tarefas:

1. Criar layout `/admin`.
2. Criar dashboard simples.
3. Criar CRUD simples de categorias.
4. Criar listagem de estabelecimentos.
5. Criar detalhe de estabelecimento.
6. Criar ações de aprovar, bloquear, reativar e inativar.
7. Criar campo/ação para mensalidade padrão do estabelecimento.
8. Criar listagem de consumidores.

Critério de pronto:

- admin aprova estabelecimento;
- admin bloqueia e reativa;
- categorias podem ser mantidas;
- consumidores podem ser consultados.

### Etapa 5 - Painel do estabelecimento

Objetivo: estabelecimento gerenciar perfil e catálogo.

Tarefas:

1. Criar layout `/estabelecimento`.
2. Criar dashboard simples.
3. Criar tela de perfil operacional.
4. Implementar upload de logo.
5. Criar listagem de produtos.
6. Criar formulário de produto.
7. Implementar upload de foto do produto.
8. Implementar ativação/inativação.
9. Implementar exclusão conforme regra segura.
10. Garantir ownership: merchant só mexe no próprio estabelecimento.

Critério de pronto:

- estabelecimento aprovado cria produtos;
- produto ativo aparece no catálogo público;
- produto inativo não aparece;
- estabelecimento não acessa dados de outro.

### Etapa 6 - Catálogo do consumidor e carrinho

Objetivo: consumidor navegar e montar pedido.

Tarefas:

1. Criar `/lojas`.
2. Listar apenas estabelecimentos ativos.
3. Criar `/lojas/[slug]`.
4. Exibir catálogo por categoria.
5. Criar estado de carrinho no frontend.
6. Garantir carrinho de um único estabelecimento.
7. Criar tela/resumo de carrinho.
8. Criar checkout.

Critério de pronto:

- consumidor vê lojas ativas;
- consumidor vê produtos ativos;
- consumidor adiciona/remove itens;
- consumidor não mistura lojas no mesmo pedido.

### Etapa 7 - Criação de pedidos

Objetivo: finalizar pedido com segurança.

Tarefas:

1. Implementar endpoint/server action de criação de pedido.
2. Validar usuário consumidor.
3. Validar estabelecimento ativo.
4. Validar produtos ativos e do mesmo estabelecimento.
5. Recalcular valores no backend.
6. Criar `Order`, `OrderItem`, `Payment` e `OrderStatusHistory` em transação.
7. Gerar `publicCode` amigável.
8. Criar página de confirmação.
9. Criar página de acompanhamento.
10. Criar histórico de pedidos do consumidor.

Critério de pronto:

- pedido é criado corretamente;
- valores são consistentes;
- consumidor acompanha status textual;
- pedido aparece no painel do estabelecimento.

### Etapa 8 - Gestão de pedidos pelo estabelecimento

Objetivo: estabelecimento operar status do pedido.

Tarefas:

1. Criar listagem de pedidos do estabelecimento.
2. Criar filtros simples por status.
3. Criar detalhe do pedido.
4. Criar ações de status permitidas.
5. Registrar histórico a cada mudança.
6. Atualizar tela do consumidor com status atual.

Critério de pronto:

- estabelecimento aceita pedido;
- muda para preparo;
- muda para saiu para entrega;
- muda para entregue;
- pode recusar/cancelar conforme transições permitidas;
- consumidor visualiza status atualizado.

### Etapa 9 - Pagamentos

Objetivo: integrar meios previstos do MVP.

Tarefas:

1. Criar camada `PaymentGatewayProvider`.
2. Criar provider fake apenas para desenvolvimento.
3. Implementar dinheiro sem gateway.
4. Implementar provider real do gateway escolhido.
5. Implementar criação de pagamento PIX.
6. Implementar criação de pagamento cartão.
7. Implementar webhook do gateway.
8. Validar assinatura/secret do webhook.
9. Atualizar `Payment.status` e `Order.paymentStatus`.
10. Mostrar QR Code/copia-e-cola/link de checkout na confirmação.

Critério de pronto:

- dinheiro funciona manualmente;
- PIX cria pagamento no gateway;
- cartão cria fluxo seguro no gateway;
- webhook atualiza status;
- nenhum split ou subconta é criado.

### Etapa 10 - Mensalidades

Objetivo: controle administrativo/manual.

Tarefas:

1. Criar listagem de mensalidades.
2. Criar formulário de mensalidade.
3. Validar competência, vencimento e valor.
4. Permitir marcar como pago.
5. Permitir marcar como em aberto.
6. Permitir marcar como vencido.
7. Mostrar histórico simples por estabelecimento.
8. Criar atalho para bloquear/reativar estabelecimento.

Critério de pronto:

- admin cadastra cobrança manual;
- admin altera status;
- admin consulta histórico;
- bloqueio/reativação continua manual.

### Etapa 11 - PWA, responsividade e UX final

Objetivo: deixar o MVP utilizável em mobile.

Tarefas:

1. Criar manifesto PWA.
2. Criar ícones básicos.
3. Criar service worker simples.
4. Ajustar responsividade das telas públicas.
5. Ajustar responsividade dos painéis.
6. Criar estados vazios.
7. Criar feedbacks de loading/erro.
8. Padronizar badges de status.
9. Revisar textos principais em português.

Critério de pronto:

- PWA abre bem em mobile;
- instalação na tela inicial funciona quando o navegador permitir;
- telas principais não quebram em viewport mobile;
- operações têm feedback claro.

### Etapa 12 - Testes básicos e correções

Objetivo: validar todos os fluxos contratados.

Tarefas:

1. Rodar lint/build.
2. Testar cadastro de consumidor.
3. Testar cadastro de estabelecimento.
4. Testar aprovação pelo admin.
5. Testar produto com imagem.
6. Testar catálogo público.
7. Testar carrinho de uma loja.
8. Testar checkout com dinheiro.
9. Testar checkout com PIX em sandbox.
10. Testar checkout com cartão em sandbox.
11. Testar webhook de pagamento.
12. Testar atualização de status pelo estabelecimento.
13. Testar mensalidade manual.
14. Testar bloqueio de estabelecimento.
15. Testar permissões entre perfis.
16. Corrigir bugs impeditivos.

Critério de pronto:

- todos os fluxos do escopo rodam sem erro impeditivo reproduzível;
- build de produção passa;
- dados sensíveis não aparecem no frontend.

### Etapa 13 - Publicação em produção

Objetivo: entregar no ambiente do cliente.

Tarefas:

1. Configurar variáveis de produção.
2. Configurar banco PostgreSQL de produção.
3. Rodar migrations em produção.
4. Rodar seed do admin, se necessário.
5. Configurar storage de imagens.
6. Configurar gateway real em produção/sandbox conforme decisão do cliente.
7. Configurar domínio.
8. Configurar SSL.
9. Publicar app.
10. Testar URLs públicas.
11. Testar login admin.
12. Testar criação de pedido real/sandbox conforme gateway.
13. Documentar URLs finais.

Critério de pronto:

- aplicação acessível por URL de produção;
- PWA consumidor funcionando;
- painel do estabelecimento funcionando;
- painel admin funcionando;
- banco e uploads persistentes;
- gateway configurado conforme credenciais fornecidas.

### Etapa 14 - Entrega técnica

Objetivo: encerrar a fase MVP.

Tarefas:

1. Entregar código-fonte do MVP.
2. Entregar README.
3. Entregar `.env.example`.
4. Entregar lista de variáveis usadas em produção, sem expor segredos em local público.
5. Entregar URLs finais.
6. Entregar orientação básica de uso:
   - como aprovar estabelecimento;
   - como cadastrar produto;
   - como acompanhar pedido;
   - como cadastrar mensalidade.
7. Entregar checklist de aceite.
8. Informar que o cliente tem prazo de validação conforme contrato.

Critério de pronto:

- cliente consegue acessar e validar os fluxos incluídos;
- escopo entregue corresponde ao MVP contratado.

---

## 16. Cronograma sugerido de 16 dias úteis

| Dia útil | Entrega principal | Resultado esperado |
|---:|---|---|
| 1 | Bootstrap, arquitetura e setup | Projeto criado, stack configurada, estrutura base pronta |
| 2 | Banco, Prisma e seed | Schema, migration e admin inicial funcionando |
| 3 | Auth e roles | Login/cadastro e guards por perfil |
| 4 | Admin base | Dashboard, categorias e listagem de estabelecimentos |
| 5 | Aprovação/bloqueio de estabelecimentos | Fluxo administrativo operacional |
| 6 | Painel do estabelecimento | Perfil, layout e permissões do merchant |
| 7 | Produtos e uploads | CRUD de produtos com foto principal |
| 8 | Catálogo público | Lojas ativas e produtos por categoria |
| 9 | Carrinho e checkout | Carrinho de uma loja e formulário de pedido |
| 10 | Criação de pedidos | Pedido, itens, snapshots e histórico inicial |
| 11 | Gestão de pedidos | Painel do estabelecimento atualiza status |
| 12 | Pagamentos | Dinheiro + gateway PIX/cartão + webhook |
| 13 | Mensalidades | Controle manual administrativo |
| 14 | PWA, responsividade e polimento | Manifesto, mobile, estados vazios e feedbacks |
| 15 | Testes e correções | Fluxos completos validados |
| 16 | Deploy e entrega | Produção publicada e checklist final entregue |

Observação: se faltarem acessos, domínio, banco, storage, gateway ou conteúdos mínimos, o cronograma fica suspenso até o recebimento.

---

## 17. Checklist de testes de aceite

### 17.1 Acesso

- [ ] Admin consegue logar.
- [ ] Estabelecimento consegue se cadastrar.
- [ ] Consumidor consegue se cadastrar.
- [ ] Usuário não autenticado não acessa áreas privadas.
- [ ] Consumidor não acessa painel admin.
- [ ] Estabelecimento não acessa painel admin.
- [ ] Estabelecimento não acessa dados de outro estabelecimento.

### 17.2 Estabelecimentos

- [ ] Estabelecimento novo fica pendente.
- [ ] Admin aprova estabelecimento.
- [ ] Estabelecimento aprovado aparece na listagem pública.
- [ ] Admin bloqueia estabelecimento.
- [ ] Estabelecimento bloqueado não aparece para venda.
- [ ] Admin reativa estabelecimento.

### 17.3 Produtos

- [ ] Estabelecimento cadastra produto com nome, categoria, descrição, preço e foto.
- [ ] Produto ativo aparece no catálogo.
- [ ] Produto inativo não aparece no catálogo.
- [ ] Estabelecimento edita produto.
- [ ] Estabelecimento exclui/inativa produto.

### 17.4 Catálogo e carrinho

- [ ] Consumidor lista lojas ativas.
- [ ] Consumidor abre catálogo por loja.
- [ ] Produtos aparecem agrupados por categoria.
- [ ] Consumidor adiciona produto ao carrinho.
- [ ] Consumidor altera quantidade.
- [ ] Consumidor remove produto.
- [ ] Sistema impede mistura de produtos de lojas diferentes no mesmo pedido.

### 17.5 Checkout e pedidos

- [ ] Consumidor informa endereço de entrega.
- [ ] Consumidor informa observação geral.
- [ ] Consumidor seleciona PIX.
- [ ] Consumidor seleciona cartão.
- [ ] Consumidor seleciona dinheiro.
- [ ] Backend recalcula preços.
- [ ] Pedido é criado com código público.
- [ ] Itens são salvos com snapshot de nome e preço.
- [ ] Pedido aparece para o estabelecimento.

### 17.6 Status do pedido

- [ ] Pedido inicia como aguardando confirmação.
- [ ] Estabelecimento aceita pedido.
- [ ] Estabelecimento marca em preparo.
- [ ] Estabelecimento marca saiu para entrega.
- [ ] Estabelecimento marca entregue.
- [ ] Estabelecimento recusa/cancela conforme regra.
- [ ] Consumidor vê status textual atualizado.
- [ ] Histórico de status é registrado.

### 17.7 Pagamentos

- [ ] Dinheiro é registrado como pagamento manual na entrega.
- [ ] PIX cria pagamento no gateway escolhido.
- [ ] PIX exibe instruções/QR/copia-e-cola quando disponível.
- [ ] Cartão usa fluxo seguro do gateway.
- [ ] Webhook atualiza pagamento para pago quando confirmado.
- [ ] Pagamento recusado/falho é refletido no pedido.
- [ ] Não existe split de pagamento.
- [ ] Não existe subconta por estabelecimento.

### 17.8 Mensalidades

- [ ] Admin cadastra mensalidade por estabelecimento.
- [ ] Admin define competência.
- [ ] Admin define vencimento.
- [ ] Admin define valor.
- [ ] Admin marca como pago.
- [ ] Admin marca como vencido.
- [ ] Admin consulta histórico simples.
- [ ] Admin bloqueia/reativa estabelecimento manualmente.

### 17.9 PWA e produção

- [ ] Aplicação abre em navegador moderno.
- [ ] Layout funciona em mobile.
- [ ] Manifesto PWA está disponível.
- [ ] Instalação na tela inicial funciona quando o dispositivo permitir.
- [ ] URLs finais estão acessíveis.
- [ ] Build de produção passa.
- [ ] Variáveis sensíveis não estão expostas no frontend.

---

## 18. Critérios objetivos de aceite

A entrega pode ser considerada aceita quando:

1. A aplicação estiver publicada no ambiente do cliente.
2. A URL do PWA do consumidor estiver acessível.
3. A URL do painel do estabelecimento estiver acessível.
4. A URL do painel administrativo estiver acessível.
5. Os fluxos descritos neste plano estiverem executáveis sem erro impeditivo reproduzível.
6. O cliente conseguir validar o MVP com base apenas nos itens incluídos.
7. O código-fonte do MVP estiver entregue.
8. O README e `.env.example` estiverem entregues.
9. O checklist de testes básicos estiver validado.

Não considerar como bug:

- pedido de melhoria visual subjetiva;
- nova regra de negócio;
- nova integração;
- novo campo fora do escopo;
- alteração estrutural de fluxo;
- app nativo;
- split;
- entregador;
- push;
- WhatsApp;
- cupom;
- fidelidade;
- importação em massa;
- relatório avançado.

---

## 19. README mínimo que deve ser entregue

Criar `README.md` com:

```md
# Plataforma Delivery - MVP

## Stack
- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS

## Requisitos
- Node.js
- PostgreSQL
- Conta/storage para imagens
- Gateway de pagamento escolhido pelo cliente

## Configuração
1. Copiar `.env.example` para `.env`.
2. Preencher `DATABASE_URL`.
3. Preencher `AUTH_SECRET`.
4. Preencher credenciais do gateway.
5. Preencher storage de uploads.

## Comandos
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

## Produção
npm run build
npx prisma migrate deploy
npm run start

## Perfis
- ADMIN
- MERCHANT
- CUSTOMER

## Observações
Este MVP não inclui app nativo, entregador, split de pagamentos, push notification, cupons ou relatórios avançados.
```

---

## 20. Definition of Done técnico

O Codex só deve considerar a implementação finalizada quando todos os itens abaixo estiverem concluídos:

- [ ] Projeto compila sem erro.
- [ ] Migrations aplicam em banco limpo.
- [ ] Seed cria admin inicial.
- [ ] Login funciona.
- [ ] Roles funcionam.
- [ ] Admin aprova estabelecimento.
- [ ] Estabelecimento cadastra produto.
- [ ] Consumidor visualiza catálogo.
- [ ] Carrinho funciona com uma loja.
- [ ] Checkout cria pedido.
- [ ] Dinheiro funciona como pagamento manual.
- [ ] PIX/cartão integrados ao gateway escolhido ou bloqueados claramente se credenciais ausentes em produção.
- [ ] Webhook implementado para gateway escolhido.
- [ ] Estabelecimento atualiza status do pedido.
- [ ] Consumidor acompanha status.
- [ ] Admin cadastra mensalidade manual.
- [ ] PWA tem manifesto.
- [ ] Layout mobile está utilizável.
- [ ] Uploads persistem em produção.
- [ ] Build de produção passa.
- [ ] README entregue.
- [ ] `.env.example` entregue.
- [ ] Nenhum item fora do escopo foi implementado como obrigação desta fase.

---

## 21. Prompt final para colar no Codex

```txt
Implemente o MVP descrito neste documento de forma incremental.

Regras obrigatórias:
1. Não implemente funcionalidades fora do escopo.
2. Use uma aplicação full-stack web responsiva.
3. O consumidor deve usar PWA, não app nativo.
4. Crie painel web do estabelecimento.
5. Crie painel web administrativo.
6. Use autenticação por e-mail/senha com roles ADMIN, MERCHANT e CUSTOMER.
7. Use banco relacional com Prisma e PostgreSQL.
8. Crie schema, migrations e seed de admin.
9. Implemente aprovação/bloqueio/reativação manual de estabelecimentos.
10. Implemente CRUD de produtos com foto principal.
11. Implemente catálogo público somente para estabelecimentos ativos.
12. Implemente carrinho de apenas um estabelecimento por pedido.
13. Implemente checkout com endereço, observação e forma de pagamento.
14. Implemente pedidos com status textual e histórico básico.
15. Implemente painel do estabelecimento para atualizar status do pedido.
16. Implemente pagamentos PIX/cartão via 1 gateway escolhido e dinheiro como manual.
17. Não implemente split, subcontas, repasse automático ou recorrência.
18. Implemente controle manual de mensalidades no admin.
19. Implemente PWA simples com manifesto e responsividade mobile.
20. Entregue README, .env.example, migrations, seed e checklist de teste.

Siga a ordem de implementação por etapas deste documento. Ao terminar cada etapa, rode lint/build/testes básicos aplicáveis e corrija erros antes de avançar.
```

---

## 22. Observação final de escopo

Este plano descreve o produto final da fase MVP. Qualquer item não listado como incluído deve ser tratado como evolução futura, com novo orçamento, novo prazo e nova aprovação.
