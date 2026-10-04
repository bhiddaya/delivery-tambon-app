import assert from "node:assert/strict";
import { test } from "node:test";
import { basketLines, basketSubtotal, configuredBaseFee, nextDriverStatus } from "../src/rebuilt/order-logic.ts";

const menu = [
  { id: "rice", name: "ข้าวผัด", price: 45.5, is_available: true, is_hidden: false },
  { id: "sold", name: "น้ำชา", price: 15, is_available: false, is_hidden: false },
  { id: "old", name: "เมนูพักขาย", price: 25, is_available: true, is_hidden: true },
];

test("basket prices come from current menu and unavailable/deleted products are excluded", () => {
  const basket = { rice: 2, sold: 3, old: 1, deleted: 10 };
  assert.equal(basketSubtotal(menu, basket), 91);
  assert.deepEqual(basketLines(menu, basket).map(l => [l.item.id, l.quantity]), [["rice", 2]]);
  assert.equal(basketSubtotal([{ ...menu[0], price: 50 }], basket), 100);
});

test("invalid quantities and prices cannot produce misleading totals", () => {
  for (const qty of [NaN, Infinity, -1, 0, 0.5, undefined]) assert.equal(basketSubtotal(menu, { rice: qty }), 0);
  assert.equal(basketSubtotal(menu, { rice: 1000 }), 45.5 * 99);
  assert.equal(basketSubtotal([{ ...menu[0], price: NaN }], { rice: 1 }), 0);
  assert.equal(basketSubtotal([{ ...menu[0], price: -1 }], { rice: 1 }), 0);
});

test("missing delivery fees remain unknown; explicitly configured zero is valid", () => {
  for (const fee of [null, undefined, NaN, Infinity, -1]) assert.equal(configuredBaseFee(fee), null);
  assert.equal(configuredBaseFee(0), 0);
  assert.equal(configuredBaseFee(25.5), 25.5);
});

test("rider advances only an accepted or in-progress job", () => {
  assert.equal(nextDriverStatus("accepted"), "in_progress");
  assert.equal(nextDriverStatus("in_progress"), "delivered");
  for (const status of ["pending", "delivered", "cancelled", "unknown"]) assert.equal(nextDriverStatus(status), null);
});
