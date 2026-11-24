import { test } from "node:test";
import assert from "node:assert/strict";
import { createTeachingSearch, pickSources, shortCite } from "../src/teachings.mjs";
import { stripTags } from "../src/provider.mjs";

const pt = (type, file, entry, text) => ({ payload: { type, file, entry, cite: `${file}-${entry}`, text } });

test("เลือกตามโควตา 4/4/2 และข้ามชิ้นจากเรื่องเดียวกัน", () => {
  const books = { points: [pt("book", "a", 1, "x"), pt("book", "a", 1, "dup"), ...[2, 3, 4, 5].map((n) => pt("book", "a", n, "y"))] };
  const tip = { points: [1, 2, 3].map((n) => pt("tipitaka", "t", n, "z")) };
  const got = pickSources([books, { points: [] }, tip]);
  assert.deepEqual(got.map((s) => s.cite), ["a-1", "a-2", "a-3", "a-4", "t-1", "t-2"]);
});

test("ค้นจริงผ่าน fetch: embed แล้วค้น 3 ประเภทด้วยกุญแจอ่านอย่างเดียว", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const json = url.includes("bge-m3")
      ? { result: { data: [[0.1, 0.2]] } }
      : { result: [{ points: [pt("book", "b", 1, "ข้อความหนังสือ")] }, { points: [] }, { points: [] }] };
    return { ok: true, json: async () => json };
  };
  const search = createTeachingSearch(
    { cfAccountId: "acc", cfApiToken: "cf", qdrantUrl: "http://qdrant:6333", qdrantReadKey: "ro" },
    fakeFetch,
  );
  const out = await search("โกรธง่าย", "dhamma");
  assert.match(calls[0].url, /accounts\/acc\/ai\/run\/@cf\/baai\/bge-m3$/);
  assert.equal(calls[0].headers.authorization, "Bearer cf");
  assert.equal(calls[1].url, "http://qdrant:6333/collections/dhamma_v1/points/query/batch");
  assert.equal(calls[1].headers["api-key"], "ro");
  assert.deepEqual(calls[1].body.searches.map((s) => s.filter.must[0].match.value), ["book", "sermon", "tipitaka"]);
  assert.deepEqual(calls[1].body.searches.map((s) => s.limit), [12, 12, 9]); // โหมดถามธรรมะ 4/4/3 x3
  assert.match(out.text, /^<sources>\n\[S1\] \(หนังสือ\) b-1\nข้อความหนังสือ\n<\/sources>$/);
  assert.deepEqual(out.cites, ["หนังสือ: b-1"]);
});

test("ที่มาบนจอตัดรหัสไฟล์คำเทศน์ออก", () => {
  assert.equal(
    shortCite('"กรรมที่มีกฎ" · ปาฐกถาวันอาทิตย์ · (16ai โลกุตระ เรื่อง ๓๑๓๕)'),
    '"กรรมที่มีกฎ" · ปาฐกถาวันอาทิตย์',
  );
});

test("ค้นล้มเหลวเมื่อ Qdrant ตอบผิด", async () => {
  const bad = async (url) => (url.includes("bge-m3")
    ? { ok: true, json: async () => ({ result: { data: [[1]] } }) }
    : { ok: false, status: 403 });
  const search = createTeachingSearch({ cfAccountId: "a", cfApiToken: "b", qdrantUrl: "http://q", qdrantReadKey: "c" }, bad);
  await assert.rejects(search("x"), /HTTP 403/);
});

test("ลบรหัสอ้างอิงออกจากข้อความที่แสดง", () => {
  assert.equal(stripTags("ลองหายใจช้า ๆ [P1] [S2] แล้วค่อยคุย [S10]"), "ลองหายใจช้า ๆ แล้วค่อยคุย");
  assert.equal(stripTags("ลองดูนะ [S110, P1] การมีเพื่อน"), "ลองดูนะ การมีเพื่อน");
  assert.equal(stripTags("<ctrl46><ctrl46>"), "");
});
