// Offline interaction tests. All database, account and navigation calls are mocks.
// Install isolated test tools and run as documented in docs/46-DELIVERY-REBUILD.md.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const projectRequire = createRequire(path.join(base, 'package.json'));
const toolRequire = process.env.DELIVERY_QA_TOOLS ? createRequire(path.join(process.env.DELIVERY_QA_TOOLS, 'package.json')) : projectRequire;
const { JSDOM } = toolRequire('jsdom');
const esbuild = toolRequire('esbuild');
const React = projectRequire(base + '/node_modules/react');
const cache = base + '/node_modules/.cache/rebuilt-ui.cjs';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/customer' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = projectRequire(base + '/node_modules/react-dom/client');
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
const profile = { id: 'user', role: 'customer', tambon_id: 'area', full_name: 'ผู้ทดสอบจำลอง', is_test: false, approved: true, line_user_id: 'mock-only', suspended_at: null };
const shop = { id: 'shop', profile_id: 'user', tambon_id: 'area', name: 'ร้านจำลอง', category: 'อาหาร', is_open: true, is_test: false, address: 'บ้านเลขที่จำลอง' };
const item = { id: 'rice', merchant_id: 'shop', name: 'ข้าวผัด', price: 45, is_available: true, is_hidden: false, photo_url: null };
const area = { id: 'area', name: 'ตำบลจำลอง', slug: 'mock-area', is_active: true, intake_blocked: false, delivery_fee_base: null, delivery_fee_per_km: null };
const order = { id: 123, customer_id: 'user', tambon_id: 'area', merchant_id: 'shop', driver_id: null, type: 'food', status: 'pending', is_test: false, items_subtotal: 45, delivery_fee: 20, price: 65, pickup: 'ร้านจำลอง', dropoff: 'บ้านผู้รับจำลอง', note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), delivered_at: null, payment_method: 'เงินสดปลายทาง' };
let state;
function setup(overrides = {}) {
  state = { tables: structuredClone({ profiles: [profile], merchants: [shop], menu_items: [item], tambons: [area], orders: [], order_items: [], drivers: [{ profile_id: 'user', vehicle_type: 'motorcycle', is_online: true }], settlements: [], admin_scopes: [], tambon_board_posts: [], ...overrides }), calls: [], fail: false, race: false };
  const db = {
    from(table) { return new Query(table); },
    channel() { const channel = { on() { return channel; }, subscribe() {} }; return channel; },
    removeChannel() { return Promise.resolve(); },
    auth: { async signOut() { return { error: null }; } },
  };
  global.__deliveryTest = { profile, db, shopId: 'shop', pathname: '/customer' };
}
class Query {
  constructor(table) { this.table = table; this.filters = []; this.singleRow = false; this.operation = 'read'; this.fields = '*'; this.maximum = Infinity; }
  select(fields = '*', options = {}) { this.fields = fields; this.head = options.head; return this; }
  eq(field, value) { this.filters.push(row => row[field] === value); (this.conditions ??= []).push(['eq', field, value]); return this; }
  in(field, values) { this.filters.push(row => values.includes(row[field])); return this; }
  is(field, value) { this.filters.push(row => row[field] == value); (this.conditions ??= []).push(['is', field, value]); return this; }
  gte(field, value) { this.filters.push(row => row[field] >= value); return this; }
  order() { return this; }
  limit(n) { this.maximum = n; return this; }
  maybeSingle() { this.singleRow = true; return this; }
  single() { this.singleRow = true; return this; }
  update(patch) { this.operation = 'update'; this.patch = patch; return this; }
  insert(patch) { this.operation = 'insert'; this.patch = patch; return this; }
  then(resolve, reject) {
    try {
      state.calls.push({ table: this.table, operation: this.operation, patch: this.patch, conditions: this.conditions, fields: this.fields });
      if (state.fail) return Promise.resolve({ data: null, error: { message: 'simulated offline' } }).then(resolve, reject);
      let rows = (state.tables[this.table] ?? []).filter(row => this.filters.every(filter => filter(row))).slice(0, this.maximum);
      if (this.operation === 'update') {
        if (state.race && this.table === 'orders') rows = [];
        else rows.forEach(row => Object.assign(row, this.patch));
      }
      if (this.operation === 'insert') { rows = [{ ...this.patch, id: 'new-menu' }]; state.tables[this.table].push(...rows); }
      return Promise.resolve({ data: this.head ? null : this.singleRow ? rows[0] ?? null : rows, count: rows.length, error: null }).then(resolve, reject);
    } catch (error) { return Promise.reject(error).then(resolve, reject); }
  }
}
let root, host;
async function mount(Component, props = {}) {
  host = document.getElementById('root'); root = createRoot(host);
  await React.act(async () => root.render(React.createElement(Component, props)));
}
async function unmount() { await React.act(async () => root.unmount()); }
async function click(button) { assert(button, 'button exists'); await React.act(async () => button.click()); }
function button(text) { return [...host.querySelectorAll('button')].find(b => b.textContent.includes(text)); }
async function value(element, text) {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, text);
  await React.act(async () => element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })));
}
(async () => {
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  await esbuild.build({
    stdin: { contents: `export {default as CustomerCatalog} from './src/rebuilt/CustomerCatalog'; export {default as ShopOrdering} from './src/rebuilt/ShopOrdering'; export {default as MerchantWorkspace} from './src/rebuilt/MerchantWorkspace'; export {default as MerchantOrders} from './src/rebuilt/MerchantOrders'; export {default as DriverWorkspace} from './src/rebuilt/DriverWorkspace'; export {default as CustomerOrders} from './src/rebuilt/CustomerOrders'; export {default as AdminOverview} from './src/rebuilt/AdminOverview'; export {default as ServiceRequest} from './src/rebuilt/ServiceRequest'; export {default as AppShell} from './src/components/AppShell';`, resolveDir: base, loader: 'tsx' },
    absWorkingDir: base, bundle: true, platform: 'node', format: 'cjs', outfile: cache, tsconfig: base + '/tsconfig.json', external: ['react', 'react/jsx-runtime'],
    plugins: [{ name: 'offline-only', setup(build) {
      build.onResolve({ filter: /^@\/lib\/(supabase\/client|session-context)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => {
        let contents;
        if (args.path.endsWith('supabase/client')) contents = 'export const createClient=()=>globalThis.__deliveryTest.db;';
        else if (args.path.endsWith('session-context')) contents = 'export const useSession=()=>({profile:globalThis.__deliveryTest.profile});';
        else if (args.path === 'next/navigation') contents = 'export const useParams=()=>({id:globalThis.__deliveryTest.shopId}); export const usePathname=()=>globalThis.__deliveryTest.pathname; export const useRouter=()=>({push:()=>{},refresh:()=>{}});';
        else if (args.path === 'next/link') contents = 'import React from "react"; export default function Link({children,...props}){return React.createElement("a",props,children)}';
        else contents = 'import React from "react"; export default function Image({fill,unoptimized,sizes,...props}){return React.createElement("img",props)}';
        return { contents, loader: 'js', resolveDir: base };
      });
    } }],
  });
  const ui = projectRequire(cache);
  setup(); await mount(ui.CustomerCatalog);
  assert(host.textContent.includes('ร้านจำลอง')); assert(host.textContent.includes('เริ่ม 45 บาท'));
  await value(host.querySelector('input[type="search"]'), 'ข้าวผัด'); assert(host.querySelector('a[href="/customer/merchants/shop"]'));
  await value(host.querySelector('input[type="search"]'), 'ไม่พบแน่นอน'); assert(host.textContent.includes('ยังไม่พบร้านหรือเมนู'));
  await click(button('ล้างตัวกรอง')); assert(host.textContent.includes('ร้านจำลอง')); await unmount();
  console.log('PASS customer catalog: current data, menu search, no-match and reset');

  setup({ tambons: [{ ...area, is_active: false }] }); await mount(ui.CustomerCatalog);
  assert(host.querySelector('[role="status"]').textContent.includes('ยังส่งรายการสั่งซื้อไม่ได้'));
  assert(host.querySelector('a[href="/customer/orders"]'));
  assert(host.querySelector('a[href="/customer/parcel"]'));
  assert(host.querySelector('a[href="/customer/ride"]'));
  assert(!state.calls.some(c => c.operation !== 'read')); await unmount();

  setup({ orders: [order], order_items: [{ id: 1, order_id: 123, name: 'ข้าวผัด', qty: 1, price: 45 }] });
  global.__deliveryTest.profile = { ...profile, role: 'merchant' }; await mount(ui.MerchantOrders);
  assert(host.textContent.includes('ออเดอร์ #123'));
  assert(host.querySelector('a[href="/merchant"]'));
  assert(host.querySelector('a[href="/merchant/earnings"]'));
  const merchantRead = state.calls.find(c => c.table === 'orders');
  assert(merchantRead.conditions.some(c => c[0] === 'eq' && c[1] === 'merchant_id' && c[2] === 'shop'));
  assert(!state.calls.some(c => c.operation !== 'read')); await unmount();
  console.log('PASS closed-area message, customer shortcuts and merchant order workspace with shop scope');

  setup(); await mount(ui.ShopOrdering);
  assert(host.textContent.includes('ยังไม่ตั้งค่า')); assert(button('ตรวจรายการ').disabled);
  await click(host.querySelector('[aria-label="เพิ่ม ข้าวผัด ลงรายการ"]'));
  await click(host.querySelector('[aria-label="เพิ่ม ข้าวผัด"]'));
  assert(host.textContent.includes('90 บาท'));
  await value(host.querySelector('textarea'), 'บ้านเลขที่จำลอง 1'); assert(!button('ตรวจรายการ').disabled);
  await click(button('ตรวจรายการ'));
  const handoff = host.querySelector('a[href*="line.me"]'); assert(handoff);
  const message = decodeURIComponent(handoff.href); assert(message.includes('ข้าวผัด × 2')); assert(message.includes('รวมสินค้า 90 บาท')); assert(message.includes('ยืนยันร้านพร้อมรับ ค่าส่ง'));
  assert(!state.calls.some(c => c.table === 'orders' && c.operation !== 'read'), 'review must never create an order');
  await click(button('กลับไปแก้รายการ')); await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); assert(host.textContent.includes('45 บาท')); await unmount();
  setup({ merchants: [{ ...shop, is_open: false }] }); await mount(ui.ShopOrdering); assert(host.textContent.includes('ร้านปิดรับ')); assert(host.querySelector('[aria-label="เพิ่ม ข้าวผัด ลงรายการ"]').disabled); await unmount();
  console.log('PASS basket: quantities, current subtotal, missing fee, review, user-controlled LINE handoff, closed shop');

  setup({ orders: [{ ...order, status: 'delivered' }] }); await mount(ui.CustomerOrders);
  assert(host.textContent.includes('ไม่มีออเดอร์ในตัวกรองนี้'));
  await value(host.querySelector('select'), 'all'); assert(host.textContent.includes('ออเดอร์') && host.textContent.includes('#123')); assert(host.querySelector('details')); await unmount();
  console.log('PASS own order filters and expandable details');

  setup(); global.__deliveryTest.profile = { ...profile, role: 'merchant' }; await mount(ui.MerchantWorkspace);
  await click(button('กดแจ้งหมด')); assert(state.calls.some(c => c.table === 'menu_items' && c.patch?.is_available === false));
  await click([...host.querySelectorAll('button')].find(b => b.textContent === 'พักขาย')); assert(state.calls.some(c => c.table === 'menu_items' && c.patch?.is_hidden === true));
  await click(button('เพิ่มเมนู'));
  const fields = host.querySelectorAll('form input'); await value(fields[0], 'น้ำสมุนไพร'); await value(fields[1], '20');
  await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert(state.calls.some(c => c.table === 'menu_items' && c.operation === 'insert' && c.patch.merchant_id === 'shop' && c.patch.price === 20)); await unmount();
  console.log('PASS merchant mutations on mock data: availability, archive and add with store ownership');

  setup({ orders: [{ ...order }] }); global.__deliveryTest.profile = { ...profile, role: 'driver' }; state.race = true; await mount(ui.DriverWorkspace);
  await click(button('รับงานนี้')); assert(host.textContent.includes('อัปเดตไม่สำเร็จ'));
  const claim = state.calls.find(c => c.table === 'orders' && c.patch?.status === 'accepted');
  assert(claim.conditions.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'pending')); assert(claim.conditions.some(c => c[0] === 'is' && c[1] === 'driver_id' && c[2] === null)); await unmount();
  setup({ orders: [{ ...order, driver_id: 'user', status: 'in_progress' }] }); global.__deliveryTest.profile = { ...profile, role: 'driver' }; await mount(ui.DriverWorkspace);
  await click(button('ส่งสำเร็จแล้ว')); assert(!state.calls.some(c => c.patch?.status === 'delivered'));
  await click(button('ยืนยันส่งสำเร็จ')); assert(state.calls.some(c => c.patch?.status === 'delivered'));
  assert(!state.calls.some(c => c.table === 'drivers' && c.patch && ('today_jobs' in c.patch || 'today_earn' in c.patch)), 'delivery never overwrites finance counters'); await unmount();
  console.log('PASS rider race handling, delivery confirmation and no financial-counter writes');

  setup(); state.fail = true; await mount(ui.CustomerCatalog); assert(host.querySelector('[role="alert"]')); assert(!host.textContent.includes('ยังไม่มีร้านเปิด')); state.fail = false; await click(button('ลองอีกครั้ง')); assert(host.textContent.includes('ร้านจำลอง')); await unmount();
  setup({ tambons: [area, { ...area, id: 'unmanaged', name: 'ตำบลที่ไม่มีสิทธิ์' }] }); global.__deliveryTest.profile = { ...profile, role: 'admin' }; await mount(ui.AdminOverview); assert(!host.textContent.includes('ตำบลที่ไม่มีสิทธิ์')); assert(host.textContent.includes('ยังไม่ตั้งค่าส่ง 1 ตำบล')); assert(host.textContent.includes('0 บาท')); await unmount();
  setup(); await mount(ui.ServiceRequest, { type: 'parcel' }); assert(button('ตรวจรายละเอียด').disabled); const addresses = host.querySelectorAll('textarea'); await value(addresses[0], 'ร้านจำลอง จุดรับ'); await value(addresses[1], 'บ้านจำลอง จุดส่ง'); await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); assert(host.querySelector('a[href*="line.me"]')); assert(!state.calls.some(c => c.operation === 'insert')); await unmount();
  setup(); await mount(ui.AppShell, { role: 'customer', children: React.createElement('h1', null, 'ทดสอบเนื้อหา') }); await click(host.querySelector('[aria-label="เปิดเมนูทั้งหมด"]')); assert(host.querySelector('dialog').open); await click(host.querySelector('[aria-label="ปิดเมนู"]')); assert(!host.querySelector('dialog').open); await unmount();
  console.log('PASS retry, admin setup warning, service request review and mobile menu controls');
})().catch(error => { console.error(error); process.exitCode = 1; });
