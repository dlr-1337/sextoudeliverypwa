# Mapa de módulos — Sextou Delivery

Este diretório reserva as fronteiras dos módulos de negócio do MVP. A fundação de S01 não implementa fluxos de autenticação, cadastro, pedidos ou pagamento; ela apenas documenta onde cada responsabilidade deve morar para que as próximas slices não misturem domínio, UI e integrações.

## Princípios

- Começar por Server Components e Server Actions quando o fluxo for interno ao App Router.
- Usar Route Handlers para contratos HTTP explícitos: auth, uploads, webhooks e integrações.
- Manter validação, autorização e acesso ao banco no servidor.
- Não importar componentes de áreas privadas em páginas públicas sem uma fronteira clara.
- Não imprimir segredos, hashes, tokens de sessão ou URLs de banco em logs.

## Fronteiras planejadas

| Módulo | Responsabilidade | Fora do escopo desta fundação |
| --- | --- | --- |
| `auth` | Login/logout por e-mail e senha, hash de senha, criação/revogação de sessão e cookie `httpOnly`. | OAuth, magic link, múltiplos provedores e rate limiting avançado. |
| `users` | Modelo de usuário, papéis `ADMIN`, `MERCHANT`, `CUSTOMER` e dados básicos de perfil. | Permissões granulares, múltiplos usuários por loja e filiais. |
| `categories` | Categorias gerais dos tipos estabelecimento e produto, slugs estáveis e status ativo/inativo. | Taxonomias complexas, hierarquia profunda ou busca avançada. |
| `establishments` | Cadastro, aprovação, bloqueio, reativação e perfil operacional de estabelecimentos. | Gestão multi-filial, mapa, rota de entrega e logística. |
| `products` | CRUD de produtos da loja, preço, descrição, foto principal e status ativo/inativo. | Estoque avançado, variações, combos e importação em massa. |
| `orders` | Contratos futuros de carrinho, pedido, itens, snapshots e histórico textual de status. | Checkout real em S01, rastreamento em tempo real ou módulo de entregador. |
| `payments` | Abstração `PaymentGatewayProvider`, pagamento manual em dinheiro e provider fake/dev. | Gateway real, split, subcontas, recorrência e armazenamento de cartão. |
| `monthly-billing` | Controle administrativo manual de mensalidades por estabelecimento. | Cobrança recorrente automática, boleto, nota fiscal ou régua de cobrança. |
| `uploads` | Validação de MIME/tamanho, nomes seguros e storage local persistente configurável. | Migração obrigatória para S3/R2/MinIO antes de haver necessidade operacional. |
| `admin` | Experiências privadas de operação: aprovar lojas, gerenciar categorias e mensalidades. | Dashboard executivo, BI e auditoria administrativa avançada. |
| `merchant` | Experiências privadas da loja: status, perfil operacional e gestão de produtos. | Múltiplos operadores, permissões por setor e relatórios complexos. |
| `customer` | Experiências públicas do consumidor: catálogo, cadastro, login e pedidos futuros. | App nativo, push notification, WhatsApp automático e fidelidade. |

## Convenção de crescimento

Cada módulo deve nascer somente quando a slice correspondente implementar comportamento verificável. Até lá, este README é a fonte de alinhamento para evitar implementação antecipada de S02+ durante a fundação.
