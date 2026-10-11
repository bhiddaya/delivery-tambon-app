# Compact food selection in LINE

The /liff/shop/[id] menu now uses small photos on the left, the food name and actual unit price beside them, and a square native checkbox on the right. Selecting checks the box, highlights the row, shows the quantity controls and updates the selected-item count immediately. Unchecking removes all units of that item; reducing to zero also clears the checkbox. Edits remain local and invalidate any previous quote. The price summary, shipping and order confirmation still require explicit actions.

Sold-out items and closed shops cannot be selected or incremented. Existing selections can be removed. All controls are disabled while a request is in progress. Quantities persist through the existing session storage mechanism; no new message is sent to LINE for each edit.

This is the interactive menu opened inside LINE using LIFF, rather than a mutable checkbox embedded in an existing chat bubble. Previously received chat food cards stay in the existing conversation. Actual merchant photos and prices are loaded from the current menu; food descriptions or new images have not been fabricated.

Entry routing is also updated: new shop cards and old food=menu buttons open the specific shop at https://liff.line.me/2011443365-RD1UinVM/liff/shop/[id]. The public LIFF ID was verified from the production SDK configuration. An existing chat basket remains accessible through a separate button. Previously received messages remain on the device; customers must open a new shop entry or the direct LIFF link to see the new interface. Publish the renderer only after the frontend production route serves the checkbox version.

Validation: TypeScript and changed-component ESLint pass; 68 Node tests, 12 offline UI groups and 12 workflow checks pass. Checks cover checkbox feedback, remove-all, zero quantity, saved quantities, sold-out/closed guards, explicit review including shipping, confirmation, lost-response retries, direct LIFF shop URLs and access to a previous chat basket. Browser layout and real LINE acceptance remain pending deployment.
