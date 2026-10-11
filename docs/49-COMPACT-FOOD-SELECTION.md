# Compact food selection in LINE

The /liff/shop/[id] menu now uses small photos on the left, the food name and actual unit price beside them, and a square native checkbox on the right. Selecting checks the box, highlights the row, shows the quantity controls and updates the selected-item count immediately. Unchecking removes all units of that item; reducing to zero also clears the checkbox. Edits remain local and invalidate any previous quote. The price summary, shipping and order confirmation still require explicit actions.

Sold-out items and closed shops cannot be selected or incremented. Existing selections can be removed. All controls are disabled while a request is in progress. Quantities persist through the existing session storage mechanism; no new message is sent to LINE for each edit.

This is the interactive menu opened inside LINE using LIFF, rather than a mutable checkbox embedded in an existing chat bubble. The existing chat food cards remain unchanged. Actual merchant photos and prices are loaded from the current menu; food descriptions or new images have not been fabricated.

Validation: TypeScript passes. The offline UI suite covers checkbox feedback, remove-all, zero quantity, saved quantities, sold-out/closed guards, explicit review including shipping, confirmation and lost-response retries. Browser layout and real LINE acceptance remain pending deployment/access to the protected Vercel preview.
