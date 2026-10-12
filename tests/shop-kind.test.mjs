import assert from "node:assert/strict";
import { test } from "node:test";
import { shopKind } from "../src/lib/shop-kind.ts";

test("shops are split into food and dry goods from the category the shop typed", () => {
  assert.equal(shopKind("ส้มตำอาหารกล่องและบะหมี่"), "food");
  assert.equal(shopKind("อาหารและเครื่องดื่ม"), "food");
  assert.equal(shopKind(null), "food");
  assert.equal(shopKind("อุปโภค บริโภค"), "goods");
  assert.equal(shopKind("ของกินของใช้ในครัวเรือน"), "goods");
  assert.equal(shopKind("ร้านขายของแห้ง"), "goods");
});
