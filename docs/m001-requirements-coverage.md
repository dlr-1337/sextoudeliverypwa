Only R001–R016 are required for M001 completion; R017–R043 are downstream/deferred/no-go dispositions and are not M001 implementation gaps.

# M001 Requirements Coverage Matrix

This tracked source document is the reviewer-facing M001 requirement matrix. Use it to decide whether a requirement is covered by M001, belongs to a later milestone, is intentionally deferred, or is an expected absence. Generated GSD metadata remains canonical for workflow state, but this file is the stable source-level seam for reviewers who should not need ignored planning artifacts at test time.

## How to read the dispositions

- **M001-covered / validated** means the requirement is part of the M001 foundation and is backed by S01–S06 summary evidence plus `npm run verify:m001`.
- **Downstream active / not-M001-gap** means the requirement remains active for a future milestone owner; M001 may provide foundation evidence but does not claim the feature shipped.
- **Deferred / not-M001-blocker** means the item is intentionally postponed hardening or quality work and does not block M001 completion.
- **No-go / expected absence** means non-implementation is the correct M001 evidence unless a future scope decision changes the product boundary.

## M001-covered / validated

| ID | Requirement covered by M001 | Evidence | Disposition |
|---|---|---|---|
| R001 | Next.js App Router, TypeScript, Tailwind, module structure, base components, and initial layout. | S01 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated foundation. |
| R002 | Prisma with PostgreSQL, initial schema, applicable migration, and generated client. | S01 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated database foundation. |
| R003 | Environment-driven seed for initial admin user and base categories. | S01 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated launchability foundation. |
| R004 | Email/password login and logout with Argon2id and opaque httpOnly database sessions. | S02 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated auth foundation. |
| R005 | Server-side role protection for routes and operations without trusting frontend role input. | S02 through S05 summaries; S06 final verification; `npm run verify:m001`. | M001-covered; validated authorization boundary. |
| R006 | Customer registration with name, email, optional phone, and minimum password. | S02 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated account foundation for later ordering. |
| R007 | Merchant registration that creates a MERCHANT user and PENDING establishment. | S02 and S04 summaries; S06 final verification; `npm run verify:m001`. | M001-covered; validated onboarding foundation. |
| R008 | Admin listing, detail view, approval, blocking, reactivation, and inactivation for establishments. | S03 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated admin establishment control. |
| R009 | Admin category create/edit/activate/inactivate flows for establishment and product category types. | S03 and S05 summaries; S06 final verification; `npm run verify:m001`. | M001-covered; validated category foundation. |
| R010 | Approved merchant panel with own establishment status and operational profile editing. | S04 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated merchant profile foundation. |
| R011 | Validated local upload of establishment logo and product primary photo with configurable persistent storage. | S04 and S05 summaries; S06 final verification; `npm run verify:m001`. | M001-covered; validated local upload contract. |
| R012 | Merchant create, edit, activate, inactivate, and archive-as-delete product lifecycle for own establishment. | S05 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated product management foundation. |
| R013 | Public catalog lists only ACTIVE establishments and ACTIVE products. | S05 summary; S06 final verification; `npm run verify:m001`. | M001-covered; validated public catalog foundation. |
| R014 | Merchant private reads and mutations are scoped to resources belonging to the merchant's own establishment. | S04 and S05 summaries; S06 final verification; `npm run verify:m001`. | M001-covered; validated ownership boundary. |
| R015 | Main M001 flows show safe loading, empty, validation-error, and access-denied feedback. | S06 summary; route feedback tests; `npm run verify:m001`. | M001-covered; validated failure visibility. |
| R016 | Stack, environment variables, local setup, migrations, seed, execution, and build commands are documented. | S06 summary; README setup contract tests; `npm run verify:m001`. | M001-covered; validated operability documentation. |

## Downstream active / not-M001-gap

| ID | Future active requirement | Owner | M001 disposition |
|---|---|---|---|
| R017 | Customer cart with products from only one establishment per order. | M002/provisional | Downstream active/not-M001-gap; M001 provides active catalog and product foundations, while cart UI and persistence are intentionally future work. |
| R018 | Checkout collects address, general notes, and payment method. | M002/provisional | Downstream active/not-M001-gap; M001 provides auth and catalog foundations, while checkout fields and order submission are future work with payment support later. |
| R019 | Backend creates order, items, payment, and history transactionally after validating customer, active store, active same-store products, and recalculated values. | M002/provisional | Downstream active/not-M001-gap; M001 may contain schema/auth/catalog foundations but does not claim transactional order creation. |
| R020 | Customer tracks textual order status and basic history by public code. | M002/provisional | Downstream active/not-M001-gap; public order tracking is future work, while M001 only supplies foundation evidence. |
| R021 | Merchant changes own order status through allowed transitions and records history. | M003/provisional | Downstream active/not-M001-gap; M001 merchant ownership and status patterns support this later operational order flow. |
| R022 | PaymentGatewayProvider contract for PIX/card plus fake/dev provider before real gateway choice. | M004/provisional | Downstream active/not-M001-gap; M001 does not deliver payment-provider runtime behavior. |
| R023 | Cash payment creates a manual payment without calling a gateway. | M004/provisional | Downstream active/not-M001-gap; M001 does not implement checkout payment creation. |
| R024 | Real PIX and card processing through one chosen gateway after provider selection and contract. | M004/provisional | Downstream active/not-M001-gap; M001 expectedly ships no real payment gateway integration. |
| R025 | Gateway webhook verifies supported secret/signature and updates payment and order payment status. | M004/provisional | Downstream active/not-M001-gap; M001 has no gateway webhook implementation. |
| R026 | Admin creates monthly charges per establishment and marks them open, paid, or overdue. | M005/provisional | Downstream active/not-M001-gap; M001 admin establishment controls are supporting foundation only, not billing. |
| R027 | Manifest, mobile responsiveness, and simple service worker/cache without push or offline checkout. | M005/provisional | Downstream active/not-M001-gap; M001 has responsive UI foundation but not final installable PWA validation. |
| R028 | Production VPS publication with PostgreSQL, persistent upload storage, domain/SSL, and configured variables. | M006/provisional | Downstream active/not-M001-gap; M001 local setup and verification are supporting evidence, not production deployment. |
| R029 | Final code handoff, README, environment example, final URLs, basic usage guidance, and acceptance checklist. | M006/provisional | Downstream active/not-M001-gap; M001 documentation is an initial foundation, not the final delivery package. |

## Deferred / not-M001-blocker

| ID | Deferred item | Revisit trigger | M001 disposition |
|---|---|---|---|
| R030 | Advanced brute-force protection, lockout, and refined rate limiting. | Revisit in a security-hardening milestone or before public production auth risk increases. | Deferred; not-M001-blocker; the absence of advanced rate limiting does not block M001. |
| R031 | Migration of uploads to S3/R2/MinIO/Supabase/Cloudinary-compatible object storage. | Revisit in storage hardening, backup, or production deploy planning. | Deferred; not-M001-blocker; local persistent upload storage is acceptable M001 evidence. |
| R032 | Detailed administrative action audit trails. | Revisit when mature admin auditability is planned beyond basic safe feedback and error practices. | Deferred; not-M001-blocker; detailed audit trails are not required for M001. |
| R033 | Broad unit/integration/e2e suite beyond pragmatic critical tests, lint, build, and smokes. | Revisit in a quality-hardening milestone. | Deferred; not-M001-blocker; current M001 verification remains the accepted pragmatic bar. |

## No-go / expected absence anti-features

| ID | No-go item | M001 disposition |
|---|---|---|
| R034 | Native app build or App Store/Google Play publication. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R035 | Delivery-agent module, geolocation, routes, maps, proof of delivery, or real-time tracking. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R036 | Payment split, establishment subaccounts, or automatic payout flow. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R037 | Recurring charge generation, boleto, invoice, tax document, or formal finance automation. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R038 | Marketing, discount, relationship, loyalty, favorites, ratings, or comments features. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R039 | Automatic WhatsApp, SMS, push, or campaign email communication. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R040 | Fiscal or operational external integrations, bulk data migration, or mass import. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R041 | BI, complex reporting, or advanced executive dashboard. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R042 | Public API for third-party integrations. | No-go anti-feature; expected absence/out-of-scope for M001. |
| R043 | Multiple users per establishment, department permissions, or branches. | No-go anti-feature; expected absence/out-of-scope for M001. |
