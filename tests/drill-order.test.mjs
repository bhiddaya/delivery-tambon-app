// Offline test of the owner's drill order ("ออเดอร์ซ้อม"): rider filter, send helper and the migration's safety rules. No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const require = createRequire(path.join(base, 'package.json'));
const out = path.join(base, 'node_modules/.cache/drill.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({ entryPoints: [path.join(base, 'src/lib/drill.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, tsconfig: path.join(base, 'tsconfig.json') });
const { riderOrderFilter, sendDrill } = require(out);

// real riders: real orders (food only when paid) plus every drill; test riders: test orders only, same paid rule
assert.equal(riderOrderFilter(false), 'and(is_test.eq.false,or(type.neq.food,customer_paid_at.not.is.null)),is_drill.eq.true');
assert.equal(riderOrderFilter(true), 'and(is_test.eq.true,or(type.neq.food,customer_paid_at.not.is.null))');
assert.ok(!riderOrderFilter(true).includes('is_drill'), 'test riders never need the drill clause (drills are test orders)');

// send helper: success names the order; a closed shop and other failures get plain Thai
const db = (res) => ({ rpc: async (name, args) => { db.last = [name, args]; return res; } });
assert.equal(await sendDrill(db({ data: { order_id: 77 }, error: null }), { p_kind: 'ride', p_tambon_id: 't1' }), 'ส่งแล้ว ออเดอร์ซ้อม #77 · รอฟังเสียงได้เลย');
assert.deepEqual(db.last, ['admin_send_drill_order', { p_kind: 'ride', p_tambon_id: 't1' }]);
assert.match(await sendDrill(db({ data: null, error: { message: 'ร้านปิดรับออเดอร์แล้ว กรุณาเลือกร้านอื่น' } }), { p_kind: 'food', p_merchant_id: 'm1' }), /ร้านนี้ปิดอยู่/);
assert.equal(await sendDrill(db({ data: null, error: { message: 'boom' } }), { p_kind: 'food', p_merchant_id: 'm1' }), 'ส่งไม่สำเร็จ ลองอีกครั้ง');

// migration: drills are always test orders, owner-only, real shops only, counts still skip test orders, page shows drills
const sql = fs.readFileSync(path.join(base, 'supabase/migrations/20261016a_drill_orders.sql'), 'utf8');
assert.match(sql, /check \(not is_drill or is_test\)/);
assert.match(sql, /if not public\.is_superadmin\(\) then raise exception/);
assert.match(sql, /where m\.id = p_merchant_id and not m\.is_test/);
assert.match(sql, /revoke all on function public\.admin_send_drill_order\(text, uuid, uuid\) from public, anon;/);
assert.match(sql, /true, true, case when p_kind = 'food' then now\(\) end/, 'is_test and is_drill are both set; only food is marked paid');
assert.equal((sql.match(/'today_orders'[^\n]*not is_test/g) || []).length, 1);
assert.equal((sql.match(/ and not is_test and /g) || []).length >= 4, true, 'summary counts keep excluding test orders');
assert.match(sql, /where tambon_id=t\.id and \(not is_test or is_drill\) and status in/);
console.log('PASS drill order: rider filter, send helper, owner-only/real-shop-only/test-flagged migration');
