# LINE operations, ordering and finance

This change keeps the existing database, LINE OA, n8n and Next.js application. It does not add a second order ledger or wallet.

## Customer flow

Open /liff in LINE → choose a shop → edit +/− locally and silently → explicit summary (food + delivery) → explicit confirmation → payment QR/slip. Customer registration at /liff/register collects name, contact phone and active tambon once. The LINE ID comes from a verified ID token written by the Edge Function to app metadata; clients cannot submit their role, approval or LINE ID. This is contact registration, not SMS verification. Existing complete customers skip the form. Stored delivery point is reused; changing it invalidates the quote. A confirmation token survives reloads so a lost response can be retried without a second order.

## Merchant and driver

LINE commands: สมัครลูกค้าใหม่, งานร้านค้า, งานไรเดอร์, การเงินตำบล. Partner postbacks bind the sender's LINE account on the server. Merchant accept/ready/reject and driver claim/pickup/deliver use canonical SQL checks. Food cannot be claimed before verified payment. Nonfood COD remains available. Rejection requires a second confirmation and is blocked when money/slip/driver already exists. Opening hours use Bangkok time and support overnight periods; manual pause overrides them. The database blocks a food order outside the schedule, including direct callers. The public directory can still list a manually open shop outside scheduled hours; the menu checks authoritative availability and blocks ordering.

Foreground sound settings are device/account specific. Merchant defaults to a rising chime, driver to two alternating tones. Defaults: 3 rounds, 2 seconds each, 2-second gap, 60% volume. Controls allow 1–10 rounds, 1–10 seconds, 1–30 second gap, 10–100% volume, tone choice, test, stop this alert and disable. A user gesture is required each page session. Initial/history/filter loads do not ring; new job IDs ring only in the visible workspace, and hiding/unmounting stops queued tones. No claim is made that a website overrides LINE, system mute or lock-screen audio. Mobile audibility still needs a real-device check.

## Bank QR and finance

Merchant/driver account pages can upload a bank-generated receive-money QR instead of PromptPay: JPG/PNG/WEBP ≤5MB, account name required, optional bank name. Private storage restricts reads to the owner and canonical scoped agents. Signed links last five minutes, refresh automatically and have a manual retry. Static bank QR may need the payer to enter the amount; check the bank application's resolved recipient and amount before transferring. Uploading arbitrary bank QR does not create a dynamic amount QR or prove payment. Customer checkout still uses the tambon's canonical receive-payment configuration.

/finance is a separately installable PWA entry for canonical admin/scoped agents. It retains the existing password-session policy and database RLS, requires an area selection, reads settlements rather than estimated balances, and reuses verify_customer_payment/mark_payout_sent. Agents must check actual bank credit before verification. Payees confirm receipt themselves. Private HTML, API, Supabase data and financial mutations are never cached/offline queued. Existing auth-guard compatibility behavior for an unknown session method is retained, not strengthened in this change.

## Validation and activation gates

Run npm ci, npx tsc --noEmit, node --test tests/*.test.cjs tests/rebuilt-order.test.mjs tests/delivery-pwa.test.mjs. UI tests use isolated esbuild/jsdom dependencies as in docs/46-DELIVERY-REBUILD.md. Run tests/rebuilt-ui.test.mjs with DELIVERY_QA_TOOLS pointing to that isolated package directory. Database rollback tests are supabase/tests/line_operations.sql; all data and notification enqueues roll back. Postgres identity sequences may advance even on rollback; gaps are normal.

Recorded development evidence on 2026-10-11: 68 Node tests, 11 offline UI groups, 9 workflow dry checks and 15 live SQL rollback checks passed. Changed TypeScript passes typecheck and ESLint. Windows build compiled/checked types but failed prerender with EPERM creating .next/server/app/account.segments/account; this does not count as a passing production build.

Backend migration/Edge deployment receipts were observed in this session. Recheck live state rather than treating this note as a current health report: Supabase migration history should contain line_partner_finance_registration, line_partner_actions_followup and partner_event_audit_fix; line-login should have the verified app-metadata write. Local CLI migration filenames are the versioned source; production history uses the connector-applied names.

Frontend and n8n exports require deployment/publication and real LINE/mobile acceptance testing. Vercel connector returned 403 and local CLI had no credentials; browser control failed before opening n8n. Do not infer LINE delivery from an HTTP200 “Workflow was started”, a unit test or queued pg_net request. Inspect notification Executions, recipient targeting and LINE API responses for the same real order before claiming a full cycle.

## Recovery

Keep the preceding Vercel deployment and export both existing n8n workflows before changes. If frontend/workflow verification fails, restore those versions; additive backend changes preserve old callers. Do not drop new profile/cart/payment fields or delete orders/users. Fix database functions forward through another CLI-generated migration, preserving ACL/search_path and the canonical automatic order-event audit. The audit fix appends action details to an event already created in the same transaction instead of inserting a duplicate status event. Bank QR images and business records must be preserved during rollback.
