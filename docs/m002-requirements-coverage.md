# M002 Requirements Coverage Matrix

This tracked source document is the reviewer-facing M002 requirement matrix. Use it to verify the M002 customer money flow without reading ignored workflow artifacts. M002 closes the first CASH ordering loop; later milestones still own merchant-side order transitions, real PIX/card gateways, billing, production storage and deployment.

## How to read the dispositions

- **M002-covered / validated** means the requirement has implementation files plus automated evidence in tests, smokes, build/lint, and the configured PostgreSQL/Playwright proof.
- **M002-supported / downstream owner remains** means M002 creates or displays the foundation, but a later milestone still owns the full product behavior.
- **S06 final proof** means the browser E2E and local operability scripts are the acceptance evidence, not just source-level unit tests.
- **Secret-safe evidence** means commands may print key names, public order codes, counts and statuses, but must not print database URLs, passwords, session tokens, hashes, provider payloads, PIX copy-paste strings or card metadata.

## M002 coverage summary

| ID | M002 disposition | Implementation files | Test / smoke / E2E evidence | Notes |
|---|---|---|---|---|
| R017 | M002-covered / validated | `src/modules/cart/local-storage.ts`; `src/app/lojas/[slug]/store-cart.tsx`; checkout schemas consume the cart projection. | Cart/source tests; full `npm test`; `npm run smoke:m002`; `npm run e2e:m002`; `npm run verify:m002`. | Browser proof adds from `/lojas/[slug]` through the real button, preserves the cart through login, and never seeds `localStorage` directly. |
| R018 | M002-covered / validated | `/checkout` page/form/action boundary; checkout/order schemas; auth navigation return behavior. | Checkout/action/source tests; full `npm test`; Playwright step for CUSTOMER login return and CASH checkout submission. | Checkout collects contact, detailed address, reference, general observation and payment method. CASH is enabled/default; PIX/card are visible but disabled. |
| R019 | M002-covered / validated | Order action/core/service modules; Prisma order/item/payment/history schema; S04 cash-order smoke. | Order service/action tests; `npm run smoke:s04-cash-order`; `npm run smoke:m002`; DB assertions in `e2e/m002-money-flow.spec.ts`; `npm run verify:m002`. | Server validates CUSTOMER, ACTIVE store, ACTIVE same-store products and quantities, recalculates totals, and creates order/items/payment/history transactionally. |
| R020 | M002-covered / validated | `/pedido/[publicCode]` public tracking route; order read DTO/display helpers. | Order display/source tests; Playwright tracking-page assertions; DB lookup by captured public code; `npm run e2e:m002`. | Public tracking shows textual status, basic history, items, totals and manual cash payment state by public code only. |
| R021 | M002-supported / downstream owner remains | Initial order status/history records and public timeline rendering. | S04 order creation tests/smoke; S05 public tracking tests; S06 browser/DB assertion for the initial history row. | M002 proves the initial history foundation. Merchant status transitions remain owned by M003. |
| R023 | M002-covered / validated | CASH checkout option; order creation payment branch; Payment fields for manual cash and future providers. | Checkout payment-option tests; `npm run smoke:s04-cash-order`; `npm run smoke:m002`; Playwright disabled PIX/card assertions; DB assertions for null provider/PIX/card fields. | CASH creates a manual cash-on-delivery payment without calling a gateway or fake provider. |
| R044 | M002-covered / validated | Prisma Order/Payment schema and migration; generated client; checkout/order schemas; catalog public IDs. | Schema/order/catalog contract tests; `npm run db:generate`; full `npm test`; `npm run lint`; `npm run build`; `npm run verify:m002`. | The schema supports public codes, detailed delivery, manual cash payment and future PIX/card/provider fields before the UI flow uses them. |
| R045 | S06 final proof / validated by browser + DB | `e2e/m002-money-flow.spec.ts`; `e2e/m002-money-flow.e2e-helper.ts`; M002 fixture helper; Playwright config. | `npm run e2e:m002`; `npm run verify:m002`; Playwright trace/screenshot/video on failure; captured browser `console.error`/`pageerror`; PostgreSQL assertions by `publicCode`. | S06-owned final proof: active catalog → cart → CUSTOMER login → checkout CASH → `/pedido/[publicCode]` → public tracking plus persisted order/payment/history/totals. |
| R046 | S06 final proof / validated by operability contract | `README.md`; `.env.example`; `docs/m002-requirements-coverage.md`; `scripts/require-env.mjs`; package scripts; setup/package contract tests. | `npm test -- scripts/setup-contract-docs.test.ts scripts/verify-m002-package-scripts.test.ts`; missing-env preflights for `smoke:m002` and `e2e:m002`; configured `npm run verify:m002`. | S06-owned final proof: docs and scripts explain disposable PostgreSQL setup, required env keys, Playwright Chromium install, non-destructive command order and secret-safe failure output. |

## Command-to-boundary map

| Boundary | Command or inspection surface | Expected evidence |
|---|---|---|
| Schema/client contract | `npm run db:generate` | Prisma client generation succeeds without printing secrets. |
| Source contracts | `npm test` | Unit/source tests cover cart, checkout, order creation, public tracking, docs and script safety. |
| Static quality | `npm run lint` and `npm run build` | ESLint and Next build complete before DB/browser proof starts. |
| Disposable database readiness | `npm run db:deploy` and `npm run db:seed` | Versioned migrations apply and seed creates/updates local admin/category foundation. |
| Service-level money flow | `npm run smoke:m002` | S04 CASH order smoke plus M002 fixture smoke pass against PostgreSQL. |
| Browser final assembly | `npm run e2e:m002` | Chromium drives active catalog, cart, login, checkout CASH and public tracking; DB assertions match the public code. |
| Full local/CI contract | `npm run verify:m002` | Runs generate, tests, lint, build, deploy, seed, M001 smokes, M002 smokes and browser E2E in order. |
| Failure artifacts | `test-results/` and `playwright-report/` | Playwright trace, screenshot and video are retained on failure while ignored by git. |

## Secret-safety and destructive-command guardrails

- Missing env checks must report key names only: `DATABASE_URL`, `AUTH_SECRET`, `SESSION_COOKIE_NAME` and `SESSION_MAX_AGE_DAYS`.
- Verification scripts must not run `migrate reset`, `db push`, truncate, drop database or shell cleanup commands.
- Documentation must not include production database URLs, generated passwords, tokens, hashes, provider payloads, PIX copy-paste content, card metadata or stack traces.
- Browser public pages must not expose internal user/product/order IDs; the public order code is the only identifier intended for customers.
