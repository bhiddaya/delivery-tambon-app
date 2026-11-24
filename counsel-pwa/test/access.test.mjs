import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPerson } from "../src/config.mjs";

test("รหัสรายคน: เจอชื่อ / รหัสผิด / ไฟล์ไม่มี / ชื่อ key ของ Object", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "codes-")), "codes.json");
  await writeFile(file, JSON.stringify({ abc123: "สมชาย" }));
  assert.equal(await findPerson(file, "abc123"), "สมชาย");
  assert.equal(await findPerson(file, "wrong"), null);
  assert.equal(await findPerson(file, "toString"), null);
  assert.equal(await findPerson(file, ""), null);
  assert.equal(await findPerson(file, 123), null);
  assert.equal(await findPerson(join(file, "..", "missing.json"), "abc123"), null);
});
