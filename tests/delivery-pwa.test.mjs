import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { directoryPage, directorySearch, directoryLink } from "../src/lib/delivery-directory.ts";

test("Thai search preserves meaningful text and excludes PostgREST operators", () => {
  assert.equal(directorySearch(" บุ่งไหม กรุงเทพมหานคร "), "บุ่งไหม กรุงเทพมหานคร");
  assert.equal(directorySearch("foo%,id.eq.123_(test)"), "fooideq123test");
  assert.equal(directorySearch(["คลองกุ่ม", "บุ่งไหม"]), "");
  assert.equal(directorySearch("ก".repeat(90)).length, 80);
});

test("pagination stays bounded and links preserve search with an encoded query", () => {
  for (const input of [undefined, "0", "-2", "1e9", "Infinity", "10000", ["2"]]) assert.equal(directoryPage(input), 1);
  assert.equal(directoryPage("12"), 12);
  const url = new URL(directoryLink("คลองกุ่ม", 2), "https://example.test");
  assert.equal(url.searchParams.get("q"), "คลองกุ่ม");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.hash, "#areas");
});

async function worker(fetchImpl = async () => ({ ok: true, type: "basic", clone: () => "asset" }), failStorage = false) {
  const handlers = {};
  const saved = [];
  const removed = [];
  const offline = { body: "public offline page" };
  const cache = { addAll: async urls => saved.push(...urls), match: async key => key === "/offline.html" ? offline : undefined, put: async (key) => { if (failStorage) throw new Error("quota"); saved.push(key.url ?? key); } };
  vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { location: { origin: "https://example.test" }, addEventListener: (type, fn) => handlers[type] = fn, skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => ["buavornthai-shell-v2", "unrelated-app", "buavornthai-shell-v3", "buavornthai-shell-v4"], delete: async key => removed.push(key) },
    URL, Response, fetch: fetchImpl,
  });
  return { handlers, saved, removed, offline };
}

function request(path, overrides = {}) {
  return { url: `https://example.test${path}`, method: "GET", mode: "cors", ...overrides };
}

test("install caches only public offline resources and removes only this app's old cache", async () => {
  const { handlers, saved, removed } = await worker();
  let pending;
  handlers.install({ waitUntil: promise => pending = promise });
  await pending;
  assert(saved.includes("/offline.html"));
  assert(!saved.includes("/"));
  handlers.activate({ waitUntil: promise => pending = promise });
  await pending;
  assert.deepEqual(removed, ["buavornthai-shell-v2", "buavornthai-shell-v3"]);
});

test("APIs, account HTML fetches, RSC data, mutations and external requests are not cached", async () => {
  const { handlers, saved } = await worker();
  for (const req of [request("/api/admin/reset-password"), request("/customer/orders?_rsc=123"), request("/account"), request("/delivery?_rsc=123"), request("/delivery", { method: "POST" }), request("/data", { url: "https://database.example.test/data" })]) {
    let intercepted = false;
    handlers.fetch({ request: req, respondWith: () => intercepted = true });
    assert.equal(intercepted, false, req.url);
  }
  assert.equal(saved.length, 0);
});

test("online navigation returns fresh content without caching private pages", async () => {
  const fresh = { body: "current account" };
  const { handlers, saved } = await worker(async () => fresh);
  let response;
  handlers.fetch({ request: request("/account", { mode: "navigate" }), respondWith: promise => response = promise });
  assert.equal(await response, fresh);
  assert.equal(saved.length, 0);
});

test("offline navigation returns a public fallback without exposing prior account data", async () => {
  const { handlers, saved, offline } = await worker(async () => { throw new Error("offline"); });
  let response;
  handlers.fetch({ request: request("/customer/orders", { mode: "navigate" }), respondWith: promise => response = promise });
  assert.equal(await response, offline);
  assert.equal(saved.length, 0);
});

test("static assets can be cached", async () => {
  const { handlers, saved } = await worker();
  let response;
  handlers.fetch({ request: request("/_next/static/chunks/app.js"), respondWith: promise => response = promise });
  assert.equal((await response).ok, true);
  assert.deepEqual(saved, ["https://example.test/_next/static/chunks/app.js"]);
});

test("storage failure does not break the network response", async () => {
  const { handlers, saved } = await worker(undefined, true);
  let response;
  handlers.fetch({ request: request("/_next/static/chunks/app.js"), respondWith: promise => response = promise });
  assert.equal((await response).ok, true);
  assert.equal(saved.length, 0);
});

test("manifest preserves app identity and icons match actual dimensions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/app");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const offline = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
  assert(offline.includes('lang="th"'));
  assert(offline.includes('href="/delivery"'));
  assert(!offline.includes("<script"));
});
