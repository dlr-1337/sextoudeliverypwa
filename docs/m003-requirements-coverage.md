# M003 Requirements Coverage Matrix

This tracked source document is the reviewer-facing M003 requirement matrix. Use it to verify the merchant order-operation loop without reading ignored workflow artifacts. M003 composes the delivered M002 CASH order flow with a protected merchant inbox/detail/status path and a public tracking page that reflects the merchant update.

## How to read the dispositions

- **M003-covered / validated** means the requirement has implementation files plus automated source, smoke, browser, build and verification evidence.
- **Final assembly evidence** means `npm run verify:m003` is the objective proof: it runs source tests, lint/build, disposable PostgreSQL deploy/seed, M001/M002 smokes, the M003 order-operation smoke and Chromium E2E.
- **Secret-safe evidence** means command output may include key names, public order codes, statuses, booleans and counts, but must not print database URLs, passwords, session tokens, hashes, provider payloads, PIX copy-paste strings, card metadata, private delivery fields, raw Prisma stacks or internal ids on public surfaces.
- **Non-destructive evidence** means verification creates unique disposable rows and session records; it must not run `migrate reset`, `db push`, truncate, drop database or hard cleanup SQL.

## M003 coverage summary

| ID | M003 disposition | Implementation files | Test / smoke / E2E evidence | Notes |
|---|---|---|---|---|
| R021 | M003-covered / validated | `src/modules/orders/service-core.ts`; `src/modules/orders/actions.ts`; `src/app/estabelecimento/pedidos/[id]/order-status-actions.tsx`; `src/app/pedido/[publicCode]/page.tsx`. | `src/modules/orders/service-core.test.ts`; `src/modules/orders/action-core.test.ts`; `src/app/estabelecimento/pedidos/[id]/order-detail-source.test.ts`; `scripts/verify-m003-order-operations.ts`; `e2e/m003-order-operations.spec.ts`; `npm run smoke:m003`; `npm run e2e:m003`; `npm run verify:m003`. | Merchant status updates use allowed transitions, expected-status concurrency checks, transactional Order/OrderStatusHistory writes and public timeline continuity. |
| R047 | M003-covered / validated | `src/modules/orders/service-core.ts`; `src/app/estabelecimento/pedidos/page.tsx`; `src/app/estabelecimento/pedidos/page-helpers.ts`; `src/app/estabelecimento/page.tsx`. | `src/modules/orders/service-core.test.ts`; `src/app/estabelecimento/pedidos/order-list-source.test.ts`; `src/app/estabelecimento/pedidos/page-helpers.test.ts`; `scripts/verify-m003-order-operations.ts`; `e2e/m003-order-operations.spec.ts`; `npm run verify:m003`. | The list resolves the merchant owner server-side, filters by the merchant establishment, supports safe status filters and does not reveal cross-store orders. |
| R048 | M003-covered / validated | `src/modules/orders/service-core.ts`; `src/app/estabelecimento/pedidos/[id]/page.tsx`; `src/app/estabelecimento/pedidos/[id]/order-status-actions.tsx`. | `src/modules/orders/service-core.test.ts`; `src/app/estabelecimento/pedidos/[id]/order-detail-source.test.ts`; `e2e/m003-order-operations.spec.ts`; `npm run e2e:m003`; `npm run verify:m003`. | The protected detail is opened by owner-scoped internal id, displays the public code for human operation and exposes enough delivery/payment/item/history data for manual fulfillment without provider fields or raw errors. |
| R049 | M003-covered / validated | `src/modules/orders/service-core.ts`; `src/modules/orders/action-core.ts`; `src/modules/orders/actions.ts`; `src/app/estabelecimento/pedidos/[id]/order-status-actions.tsx`. | `src/modules/orders/service-core.test.ts`; `src/modules/orders/action-core.test.ts`; `src/app/estabelecimento/pedidos/[id]/order-detail-source.test.ts`; `scripts/verify-m003-order-operations.ts`; `e2e/m003-order-operations.e2e-helper.ts`; `npm run smoke:m003`; `npm run verify:m003`. | Wrong-owner updates collapse to safe not-found, stale expected status returns a retryable failure, invalid transitions are rejected, inactive establishments cannot mutate and error formatting stays key/status/count-only. |
| R050 | M003-covered / validated | `src/modules/orders/service-core.ts`; `src/modules/orders/display.ts`; `src/app/pedido/[publicCode]/page.tsx`; `src/app/estabelecimento/pedidos/[id]/page.tsx`. | `src/modules/orders/display.test.ts`; `src/modules/orders/service-core.test.ts`; `src/app/pedido/order-tracking-source.test.ts`; `e2e/m003-order-operations.spec.ts`; `e2e/m003-order-operations.e2e-helper.ts`; `npm run e2e:m003`; `npm run verify:m003`. | A fresh unauthenticated public context sees “Pedido aceito” and the merchant note after the protected update, while private delivery fields, contact values, ids, auth/env keys, provider/PIX/card fields, SQL and stacks remain absent. |
| R051 | M003-covered / validated by final assembly | `package.json`; `scripts/verify-m003-order-operations.ts`; `e2e/m003-order-operations.fixture.ts`; `e2e/m003-order-operations.e2e-helper.ts`; `e2e/m003-order-operations.spec.ts`; `README.md`; `.env.example`. | `scripts/verify-m003-package-scripts.test.ts`; `e2e/m003-order-operations.fixture-source.test.ts`; `scripts/setup-contract-docs.test.ts`; `npm run smoke:m003`; `npm run e2e:m003`; `npm run verify:m003`. | The final contract proves CUSTOMER creates CASH order, owner MERCHANT accepts through protected UI/Server Action path, helper DB assertions confirm persisted status/history/payment redaction, and public tracking updates by public code. |

## Command-to-boundary map

| Boundary | Command or inspection surface | Expected evidence |
|---|---|---|
| Source/package contract | `npm test -- scripts/verify-m003-package-scripts.test.ts e2e/m003-order-operations.fixture-source.test.ts scripts/setup-contract-docs.test.ts` | Package scripts, fixture/helper privacy, README/env/coverage docs and stale deferral checks pass before runtime work. |
| Schema/client contract | `npm run db:generate` | Prisma client generation succeeds without printing secrets. |
| Static quality | `npm run lint` and `npm run build` | ESLint and Next build complete before DB/browser proof starts. |
| Disposable database readiness | `npm run db:deploy` and `npm run db:seed` | Versioned migrations apply and seed creates/updates local admin/category foundation. |
| Service-level order operation | `npm run smoke:m003` | PostgreSQL smoke creates a CASH order, proves wrong-owner/stale/invalid-transition failures, accepts as owner merchant, and verifies public DTO safety. |
| Browser final assembly | `npm run e2e:m003` | Chromium drives CUSTOMER checkout, MERCHANT list/detail/status action, unauthenticated public tracking and helper DB assertions by public code. |
| Full local/CI contract | `npm run verify:m003` | Runs generate, tests, lint, build, deploy, seed, M001/M002 smokes, M003 smoke and M002/M003 browser E2E in order. |
| Failure artifacts | `test-results/` and `playwright-report/` | Playwright trace, screenshot and video are retained on failure while ignored by git. |

## Secret-safety and destructive-command guardrails

- Missing env checks report key names only: `DATABASE_URL`, `AUTH_SECRET`, `SESSION_COOKIE_NAME` and `SESSION_MAX_AGE_DAYS`.
- M003 fixture/helper stdout is browser-safe: store/product/customer display fields, owner merchant email for login, public code and helper-only assertion summaries; generated passwords and session tokens never leave helper inputs.
- Smoke and helper output may include public codes, statuses, booleans and counts, but not database URLs, generated passwords, password hashes, session tokens, provider payloads, PIX/card data, private delivery fields or raw Prisma stacks.
- Public tracking is intentionally unauthenticated and public-code-scoped; it must not expose customer phone/e-mail, delivery address details, internal ids, changedById, provider fields, PIX copy-paste data or card metadata.
- Verification scripts create unique disposable data and revoke setup sessions; they must not run `migrate reset`, `db push`, truncate, drop database or raw destructive SQL.
