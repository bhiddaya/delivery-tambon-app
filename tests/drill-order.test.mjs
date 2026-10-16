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
const { riderOrderFilter, sendDrill, activeDrillIds, sendSoundTest, loadPushStatus, summarizePushStatus } = require(out);

// real riders: real orders (food only when paid) plus every drill; test riders: test orders only, same paid rule
assert.equal(riderOrderFilter(false), 'and(is_test.eq.false,or(type.neq.food,customer_paid_at.not.is.null)),is_drill.eq.true');
assert.equal(riderOrderFilter(true), 'and(is_test.eq.true,or(type.neq.food,customer_paid_at.not.is.null))');
assert.ok(!riderOrderFilter(true).includes('is_drill'), 'test riders never need the drill clause (drills are test orders)');

// owner's own sound: only open drill orders count, so a new one appearing rings and a cancelled/real one does not
assert.deepEqual(activeDrillIds([{ id: 1, status: 'pending', is_drill: true }, { id: 2, status: 'cancelled', is_drill: true }, { id: 3, status: 'pending' }, { id: 4, status: 'accepted', is_drill: true }]), [1, 4]);

// send helper: success names the order; a closed shop and other failures get plain Thai
const db = (res) => ({ rpc: async (name, args) => { db.last = [name, args]; return res; } });
assert.equal(await sendDrill(db({ data: { order_id: 77 }, error: null }), { p_kind: 'ride', p_tambon_id: 't1' }), 'ส่งแล้ว ออเดอร์ซ้อม #77 · รอฟังเสียงได้เลย');
assert.deepEqual(db.last, ['admin_send_drill_order', { p_kind: 'ride', p_tambon_id: 't1' }]);
assert.match(await sendDrill(db({ data: null, error: { message: 'ร้านปิดรับออเดอร์แล้ว กรุณาเลือกร้านอื่น' } }), { p_kind: 'food', p_merchant_id: 'm1' }), /ร้านนี้ปิดอยู่/);
assert.equal(await sendDrill(db({ data: null, error: { message: 'boom' } }), { p_kind: 'food', p_merchant_id: 'm1' }), 'ส่งไม่สำเร็จ ลองอีกครั้ง');

// sound test to everyone: plain-Thai result, rate limit explained, who has not enabled notifications is listed
assert.equal(await sendSoundTest(db({ data: { ok: true, devices: { agent: 2, driver: 1 } }, error: null })), 'ส่งสัญญาณแล้วถึง 3 เครื่อง (ตัวแทน 2 · ไรเดอร์ 1) ให้ฟังที่มือถือ');
assert.equal(db.last[0], 'admin_send_sound_test');
assert.match(await sendSoundTest(db({ data: { ok: true, devices: {} }, error: null })), /ยังไม่มีใครเปิดแจ้งเตือน/);
assert.match(await sendSoundTest(db({ data: null, error: { code: '54000', message: 'x' } })), /ทุก 1 นาที/);
assert.equal(await sendSoundTest(db({ data: null, error: { code: '42501', message: 'x' } })), 'ส่งไม่สำเร็จ ลองอีกครั้ง');
const rows = [{ group: 'agent', label: 'เจ้าของ', devices: 3 }, { group: 'agent', label: 'ตัวแทนก', devices: 0 }, { group: 'driver', label: 'ไรเดอร์ ข', devices: 0 }, { group: 'merchant', label: 'ร้าน ค', devices: 1 }];
assert.deepEqual(summarizePushStatus(rows), [
  { group: 'agent', title: 'ตัวแทน', people: 2, enabled: 1, missing: ['ตัวแทนก'] },
  { group: 'driver', title: 'ไรเดอร์', people: 1, enabled: 0, missing: ['ไรเดอร์ ข'] },
  { group: 'merchant', title: 'ร้านค้า', people: 1, enabled: 1, missing: [] },
]);
assert.deepEqual(await loadPushStatus(db({ data: rows, error: null })), rows);
assert.equal(await loadPushStatus(db({ data: null, error: { message: 'no' } })), null);

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
const broadcast = fs.readFileSync(path.join(base, 'supabase/migrations/20261016d_push_broadcast.sql'), 'utf8');
assert.equal((broadcast.match(/if not public\.is_superadmin\(\) then raise exception/g) || []).length, 2, 'both owner functions refuse everyone but the owner');
assert.match(broadcast, /push_broadcast_log where created_at > now\(\) - interval '1 minute'/, 'one broadcast per minute');
assert.match(broadcast, /revoke all on function public\.push_broadcast_targets\(\) from public, anon, authenticated;\s+grant execute on function public\.push_broadcast_targets\(\) to service_role;/);
assert.ok(!/'private'|vapid_private/.test(broadcast), 'no key material in the broadcast migration');
console.log('PASS drill order: rider filter, send helper, owner-only/real-shop-only/test-flagged migration');
