# Live LINE ordering verification — 12 October 2026

Main workflow l2E6ad3OTi9zsyMT is active at version ea9eef86-9dd3-4a0c-9787-a1fa49c9aa19 with 208 nodes. Its published nodes and connections match the reviewed payload semantically. Successful add/remove postbacks bypass the loading request; food and partner commands route directly to the food child. The previous active version was d0dd5ab3-89a8-406c-ba63-2a5da1c8e078.

Food child Csc8nDWFBvLegG1d is active at version dcca8792-c651-4472-8aca-49d7e2f81485 with 13 nodes. Its parser and renderer match the prepared operations code. Successful cart edits return no acknowledgement message; review includes shipping and confirmation precedes QR instructions. Nine offline workflow checks pass. No new real order or customer message was created during this verification.

Notification workflow djVS3X5Hw2vPxW8k is active at version 1641aa2e-f221-4c8d-a09d-fe708431e223. All 14 retained executions were inspected, including output error items because the multicast node continues on error. No errors were found; 11 executions reached LINE output and three early executions produced no LINE output. Workflow success alone is not evidence that a recipient read a message.

Order #155 provides historical evidence of the full driver loop on 11 October (Bangkok time):

- 10:36:24, execution 3475: new-order notice included the linked merchant and central fallback recipient.
- 11:46:13, execution 3516: verified-payment dispatch found a driver and submitted driver, customer and merchant LINE messages without error output.
- 11:47:41, partner execution 3519: pickup action returned ok and sent driver reply plus merchant/customer updates.
- 11:59:22, partner execution 3525: delivery action returned ok and sent the corresponding updates.
- The database now records delivered, a driver assignment, and customer_paid_at at 11:46:12. Merchant acceptance and food-ready timestamps remain null; this historical evidence does not establish those newer merchant steps.

The new-order notice RPC still used obsolete wording about dispatch after a location share. Migration 20261011230121_correct_order_notification_payment_copy.sql corrects food messages to wait for verified payment and preserves non-food wording, recipients, function grants and dispatch behavior. A rollback rehearsal and subsequent live output checks pass, including five existing non-food orders. The RPC remains stable, service_role-only, with the same search path. No payment, order status or queued notification was changed by the copy fix.

Frontend production remains unpublished. The protected Vercel preview previously built Ready, but runtime verification still requires access because authenticated fetching returned 403. Real mobile sound, new-customer login and a new order through the revised flow are not yet acceptance-tested. Custom sound requires a visible partner workspace after a user gesture and cannot replace LINE/system background audio.
