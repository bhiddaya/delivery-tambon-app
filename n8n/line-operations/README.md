# n8n activation — existing workflows only

Live status (12 October 2026): both existing workflows are published and verified through the official API. Main active version ea9eef86-9dd3-4a0c-9787-a1fa49c9aa19; food active version dcca8792-c651-4472-8aca-49d7e2f81485. The steps below are recovery/reference instructions, not a request to import or repeat the changes. Historical order #155 completed notice → verified payment → driver pickup → delivered without error output; the revised flow still requires a new real acceptance test. See docs/48-LIVE-LINE-VERIFICATION.md.

Prepared exports are not evidence of a published/live workflow. Use the existing IDs:
- Food child: Csc8nDWFBvLegG1d (13 nodes)
- Main LINE OA: l2E6ad3OTi9zsyMT (208 nodes)

Prefer these small edits over a full import:
1. Export JSON from both current workflows as a backup.
2. In the food child, replace only the code in แยกคำสั่ง with parse-command.js and สร้างข้อความ with build-reply.js. Keep credentials and LINE recipient/reply guards. Publish this same workflow.
3. In the main workflow, replace ส่งไประบบข้อความสื่อสาร → Workflow ID expression with main-routing-expression.txt. Replace ข้อความสื่อสารยังไม่จัดการ? → first condition left expression with main-fallback-expression.txt. Keep all other routing/credentials. Publish this same workflow.
4. Run TEST-prefixed inputs/dry checks first; tests must not send to real users. Verify both silent add/remove paths produce no messages/displayText/loading reply and still persist cart edits.
5. With an authorized real customer, verify signup once, silent local quantities, summary including shipping, explicit confirm, same token retry and QR/slip. Verify the matching notification Executions and LINE API response for merchant, agent and driver. Driver food alert follows verified money, not merely a submitted slip.

Full food-operations.json and line-main-operations.json are recovery/import artifacts containing credential references, not secrets. Never import a complete export onto a nonempty canvas: this adds duplicate nodes (historically 409). Do not create a second active main webhook with the same path. Do not delete nodes or deactivate a live workflow blindly to resolve a path conflict. If restoring a full export, restore a reviewed version into its original workflow using n8n's version/replace workflow controls and verify the node counts before publishing.

The customizable sound is on /merchant/orders and /driver while the page is visible. LINE messages link to these workspaces. A LINE message cannot change the user's LINE/system notification sound; this export does not claim that capability.

Commands: สมัครลูกค้าใหม่, งานร้านค้า, งานไรเดอร์, การเงินตำบล. การเงินตำบล now stays inside LINE (12 Oct 2026, migration 20261012h): slips waiting (same pay=ok/no buttons as the instant D41 slip push) and payouts per payee with a promptpay.io QR carrying the amount → 💸 โอนแล้ว → second confirm → settlements.paid_out_at. Daily digest: workflow GoWxvmfpBsDyOSwP at 20:30 Asia/Bangkok calls line_finance_digest_targets() and runs this child with digest=true (push, only when payouts are due). Schedule/QR upload and finance screens open via links. Finance keeps canonical scoped permissions and password login. Bank QR is configured at /account by the merchant/driver; agents see it privately when transferring settlements.

Rollback: restore the exported versions, keeping the webhook path and credentials unchanged. Preserve orders, settlements, customer accounts and uploaded QR files. See docs/47-LINE-OPERATIONS-FINANCE.md for database fix-forward recovery.
