# D25 Delivery approval bridge

This adds an explicit operator endpoint to Hermes Router, not an Auto Run
worker. Supported actions are `order.assign` and `order.cancel` with a reason.
It never calls a LINE or email endpoint, changes commission rates, or settles
payments. Assignment notification remains D47.

## Deployment

1. Review and merge both PRs. Apply the Hermes and Delivery migration to their
   respective databases. Neither migration is applied by this PR or by Vercel.
2. Generate one random key of at least 64 characters securely. Store the same
   value as Vault secret `d25_bridge_hmac` in both databases. Never put it in
   source, browser configuration, request bodies, logs, or chat. Only the two
   database signing helpers need it. Do not grant clients access to Vault.
3. On the Router, configure `DELIVERY_SUPABASE_URL` and
   `DELIVERY_SUPABASE_ANON_KEY` (publishable/anon key, never service_role).
   Deploy Router 0.10.0. Allow only the actual Dashboard origin via existing
   `ALLOWED_ORIGINS` if browser requests are required.
4. Integrate the calling UI with both user sessions. This PR contains the API
   bridge; it does not add Dashboard buttons or store a Delivery login.
5. Run an end-to-end test using is_test data after deployment. Confirm the
   command event, Delivery receipt/admin actions/order event, Hermes completion,
   and retry behavior. Do not call the endpoints with real orders for testing.

## Operator flow

- POST `/projects/4ecec344-ba76-48f3-89c1-b7cb230702d6/delivery-commands`
  with Hermes `Authorization: Bearer <user session>` and
  `X-Delivery-Token: <Delivery user session>`.
  Body: action, order_id, optional driver_id (assignment only), reason,
  work_item_id. Both sessions are verified. Hermes requires project management
  rights. The Delivery actor is read from its verified session, not the body.
- The exact JSON payload appears as the command instruction in Approval Center.
  A different authorized person approves it with existing `command_approve`.
  The requester cannot approve their own command. This is deliberately a
  manual-session command and is never dispatched to n8n.
- POST `/projects/<project_id>/delivery-commands/<command_id>/execute` with both
  sessions and no body. Hermes checks immutable payload, project, command state,
  flags and the actual approval audit record, then signs a five-minute ticket.
  Delivery validates signature, expiry, issuer/audience, bound actor and current
  approved/unsuspended actor's tambon rights before calling existing admin RPCs.
- Delivery commits the mutation, admin/order audit and receipt together. The
  command UUID is a permanent idempotency key. Same ID with changed parameters
  fails; same ID and payload returns the original receipt. Revoked Delivery
  permissions also deny receipt replay.
- Hermes completes only from a signed receipt with the exact original payload.
  It updates the command, not the overall linked work item. Existing command
  event auditing records state changes. Receipt contents contain internal IDs;
  treat them as authenticated operational data, not public output.

## Failure and rollback

If a timeout occurs after Delivery committed but before Hermes completed, retry
the **same command ID** with valid sessions. Do not create a replacement command:
that is a different operation. Keys missing/mismatched, expired tickets,
unapproved/cancelled commands, changed payloads, and insufficient current
permissions fail closed. A minted ticket remains valid up to five minutes even
if the Hermes command is subsequently cancelled; avoid cancellation after mint
and reconcile from Delivery receipts when in doubt. A distributed transaction
cannot make cancellation and the remote write atomic.

To stop execution, disable the Router endpoints or revoke execute on Delivery's
`delivery_command_execute(text,text)`. Keep both receipt tables for recovery and
audit; do not drop them after use. Do not run a reverse mutation automatically.

## Validation

Router boundary tests cover login/config failures, input restrictions, denied
approval, denied Delivery permissions, signed payload forwarding, and retry
after finish failure. SQL suites run the migration plus test assertions in one
transaction ending in ROLLBACK. They cover approval evidence/self approval,
signature forgery, payload tampering, expiry, cross-tambon denial, actual assign
and cancel admin RPCs, same-ID mismatch, duplicate receipts, and grants/RLS.
No persistent schema, key, profile or order is created by these tests.

