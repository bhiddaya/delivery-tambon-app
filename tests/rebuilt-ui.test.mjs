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
global.localStorage = dom.window.localStorage; global.sessionStorage = dom.window.sessionStorage; global.IntersectionObserver = class { observe() {} disconnect() {} }; global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = projectRequire(base + '/node_modules/react-dom/client');
window.scrollTo = () => {}; // jsdom ไม่มี (ปุ่ม ดูตะกร้า เลื่อนขึ้นบนสุด)
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
const profile = { id: 'user', role: 'customer', tambon_id: 'area', full_name: 'ผู้ทดสอบจำลอง', is_test: false, approved: true, line_user_id: 'mock-only', phone: '66812345678', suspended_at: null };
const shop = { id: 'shop', profile_id: 'user', tambon_id: 'area', name: 'ร้านจำลอง', category: 'อาหาร', is_open: true, hours_enabled: false, opening_hours: null, is_test: false, address: 'บ้านเลขที่จำลอง' };
const item = { id: 'rice', merchant_id: 'shop', name: 'ข้าวผัด', price: 45, is_available: true, is_hidden: false, photo_url: null };
const area = { id: 'area', name: 'ตำบลจำลอง', slug: 'mock-area', is_active: true, intake_blocked: false, delivery_fee_base: null, delivery_fee_per_km: null };
const order = { id: 123, customer_id: 'user', tambon_id: 'area', merchant_id: 'shop', driver_id: null, type: 'food', status: 'pending', is_test: false, items_subtotal: 45, delivery_fee: 20, price: 65, pickup: 'ร้านจำลอง', dropoff: 'บ้านผู้รับจำลอง', note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), delivered_at: null, payment_method: 'เงินสดปลายทาง' };
let state;
function setup(overrides = {}) {
  state = { tables: structuredClone({ profiles: [profile], merchants: [shop], menu_items: [item], tambons: [area], orders: [], order_items: [], drivers: [{ profile_id: 'user', vehicle_type: 'motorcycle', is_online: true }], settlements: [], admin_scopes: [], tambon_board_posts: [], ...overrides }), calls: [], fail: false, race: false };
  const db = {
    from(table) { return new Query(table); },
    async rpc(name,args) {
      state.calls.push({rpc:name,args});
      if(name==='shop_is_open') return {data:state.tables.merchants[0]?.is_open??false,error:null};
      if(name==='shop_has_pin') return {data:!state.noPin,error:null};
      if(name==='register_line_customer') return {data:{ok:true},error:null};
      if(name==='partner_order_action') {
        if(state.race) return {data:{ok:false},error:null};
        const o=state.tables.orders.find(o=>o.id===args.p_order_id);
        if(o) { o.status=args.p_action==='deliver'?'delivered':args.p_action==='pickup'?'in_progress':'accepted'; o.driver_id='user'; }
        return {data:{ok:true},error:null};
      }
      if(name==='customer_food_review') { state.quote={token:'qa-token',items:args.p_items.map(i=>({id:i.id,name:'ข้าวผัด',qty:i.qty,price:45})),items_total:args.p_items.reduce((n,i)=>n+i.qty*45,0),delivery_fee:20,point:{lat:13,lng:100,label:'บ้านเดิม'}};state.quote.grand_total=state.quote.items_total+20;return {data:{ok:true,view:'review',quote:state.quote},error:null}; }
      if(name==='customer_food_confirm') { if (!state.tables.orders.some(o=>o.id===321)) state.tables.orders.push({...order,id:321}); if(state.loseConfirm) { state.loseConfirm=false; return {data:null,error:{message:'lost response'}}; } return {data:{ok:true,view:'confirmed',order_id:321},error:null}; }
      return {data:null,error:null};
    },
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
  or() { return this; }
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
    stdin: { contents: `export {default as JobSound} from './src/components/JobSound'; export {default as QuickFoodOrder} from './src/components/QuickFoodOrder'; export {default as RegisterCustomer} from './src/app/liff/register/page'; export {default as CustomerCatalog} from './src/rebuilt/CustomerCatalog'; export {default as ShopOrdering} from './src/rebuilt/ShopOrdering'; export {default as MerchantWorkspace} from './src/rebuilt/MerchantWorkspace'; export {default as MerchantOrders} from './src/rebuilt/MerchantOrders'; export {default as DriverWorkspace} from './src/rebuilt/DriverWorkspace'; export {default as CustomerOrders} from './src/rebuilt/CustomerOrders'; export {default as AdminOverview} from './src/rebuilt/AdminOverview'; export {default as ServiceRequest} from './src/rebuilt/ServiceRequest'; export {default as AppShell} from './src/components/AppShell';`, resolveDir: base, loader: 'tsx' },
    absWorkingDir: base, bundle: true, platform: 'node', format: 'cjs', outfile: cache, tsconfig: base + '/tsconfig.json', external: ['react', 'react/jsx-runtime'],
    plugins: [{ name: 'offline-only', setup(build) {
      build.onResolve({ filter: /^@\/lib\/(supabase\/client|session-context|use-line-session)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => {
        let contents;
        if (args.path.endsWith('supabase/client')) contents = 'export const createClient=()=>globalThis.__deliveryTest.db;';
        else if (args.path.endsWith('session-context')) contents = 'export const useSession=()=>({profile:globalThis.__deliveryTest.profile,viewAs:globalThis.__deliveryTest.viewAs}); export const useOptionalSession=useSession;';
        else if (args.path.endsWith('use-line-session')) contents = 'export const useLineSession=()=>({ready:true,profile:globalThis.__deliveryTest.profile,liff:{status:"ready",isLoggedIn:true,profile:{displayName:"QA"}}});';
        else if (args.path === 'next/navigation') contents = 'export const useParams=()=>({id:globalThis.__deliveryTest.shopId}); export const usePathname=()=>globalThis.__deliveryTest.pathname; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push:(v)=>{globalThis.__deliveryTest.next=v},replace:(v)=>{globalThis.__deliveryTest.next=v},refresh:()=>{}});';
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
  assert(!host.querySelector('a[href="/merchant/earnings"]'), 'orders page no longer repeats the menu links');
  assert(button('แตะเพื่อเปิดเสียงแจ้งเตือนงานใหม่'), 'sound card is the first thing a shop sees');
  assert([...host.querySelectorAll('summary')].some(x => x.textContent.includes('ตัวกรอง')), 'filters are folded');
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
  const message = decodeURIComponent(handoff.href); assert(message.includes('ข้าวผัด × 2')); assert(message.includes('รวมสินค้า 90 บาท')); assert(message.includes('[order:v1 shop=shop'));
  assert(!state.calls.some(c => c.table === 'orders' && c.operation !== 'read'), 'review must never create an order');
  await click(button('กลับไปแก้รายการ')); await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); assert(host.textContent.includes('45 บาท')); await unmount();
  sessionStorage.clear(); setup({ merchants: [{ ...shop, is_open: false }] }); await mount(ui.ShopOrdering); assert(host.textContent.includes('ร้านปิดรับ')); assert(host.querySelector('[aria-label="เพิ่ม ข้าวผัด ลงรายการ"]').disabled); await unmount();
  console.log('PASS basket: quantities, current subtotal, missing fee, review, user-controlled LINE handoff, closed shop');

  setup({ orders: [{ ...order, status: 'delivered' }] }); await mount(ui.CustomerOrders);
  assert(host.textContent.includes('ไม่มีออเดอร์ในตัวกรองนี้'));
  await value(host.querySelector('select'), 'all'); assert(host.textContent.includes('ออเดอร์') && host.textContent.includes('#123')); assert(host.querySelector('details')); await unmount();
  console.log('PASS own order filters and expandable details');

  setup(); global.__deliveryTest.profile = { ...profile, role: 'merchant' }; await mount(ui.MerchantWorkspace);
  // แถวเมนู: ปุ่ม มีของ ↔ หมด แตะเดียว · เอาออก (ไม่ขายแล้ว) = ซ่อนจากร้าน แต่เก็บประวัติ
  await click(button('มีของ')); assert(state.calls.some(c => c.table === 'menu_items' && c.patch?.is_available === false && c.conditions?.some(([, f, v]) => f === 'merchant_id' && v === 'shop')));
  await click(button('เอาออก (ไม่ขายแล้ว)')); assert(state.calls.some(c => c.table === 'menu_items' && c.patch?.is_hidden === true));
  await click(button('เพิ่มเมนู'));
  const fields = host.querySelectorAll('form input'); await value(fields[0], 'น้ำสมุนไพร'); await value(fields[1], '20');
  await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert(state.calls.some(c => c.table === 'menu_items' && c.operation === 'insert' && c.patch.merchant_id === 'shop' && c.patch.price === 20)); await unmount();
  console.log('PASS merchant mutations on mock data: availability, archive and add with store ownership');

  setup({ orders: [{ ...order }] }); global.__deliveryTest.profile = { ...profile, role: 'driver' }; state.race = true; await mount(ui.DriverWorkspace);
  await click(button('รับงานนี้')); assert(host.textContent.includes('อัปเดตไม่สำเร็จ'));
  const claim = state.calls.find(c => c.rpc === 'partner_order_action');
  assert.equal(claim.args.p_action,'accept_driver'); assert.equal(claim.args.p_order_id,123); assert(claim.args.p_action_id); await unmount();
  setup({ orders: [{ ...order, driver_id: 'user', status: 'in_progress' }] }); global.__deliveryTest.profile = { ...profile, role: 'driver' }; await mount(ui.DriverWorkspace);
  await click(button('ส่งสำเร็จแล้ว')); assert(!state.calls.some(c => c.patch?.status === 'delivered'));
  await click(button('ยืนยันส่งสำเร็จ')); assert(state.calls.some(c => c.rpc==='partner_order_action' && c.args.p_action==='deliver'));
  assert(!state.calls.some(c => c.table === 'drivers' && c.patch && ('today_jobs' in c.patch || 'today_earn' in c.patch)), 'delivery never overwrites finance counters'); await unmount();
  console.log('PASS rider race handling, delivery confirmation and no financial-counter writes');

  // หน้าร้าน LIFF แบบ LINE MAN: ปุ่ม + ใส่ตะกร้า → − จำนวน + · แถบ ดูตะกร้า → หน้าตะกร้า สรุปยอดและค่าส่ง
  sessionStorage.clear(); setup(); await mount(ui.QuickFoodOrder);
  const addRice = () => click(host.querySelector('[aria-label="ใส่ ข้าวผัด ลงตะกร้า"]'));
  const riceQty = () => host.querySelector('[aria-label="จำนวน ข้าวผัด"]')?.textContent;
  assert(!button('ดูตะกร้า'));
  await addRice(); assert.equal(riceQty(), '1'); assert(button('ดูตะกร้า').textContent.includes('45 บาท'));
  await click(host.querySelector('[aria-label="เพิ่ม ข้าวผัด"]')); assert.equal(riceQty(), '2');
  await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); assert.equal(riceQty(), undefined); assert(!button('ดูตะกร้า'));
  await addRice(); await click(host.querySelector('[aria-label="เพิ่ม ข้าวผัด"]')); await click(host.querySelector('[aria-label="ลด ข้าวผัด"]'));
  assert.equal(state.calls.filter(c=>c.rpc?.startsWith('customer_food')).length,0,'edits stay local');
  await click(button('ดูตะกร้า')); assert(!host.textContent.includes('รวมชำระ'));
  await click(button('สรุปยอดและค่าส่ง · 1 ชิ้น')); assert(host.textContent.includes('รวมชำระ')); assert(host.textContent.includes('65 บาท')); assert(host.textContent.includes('บ้านเดิม'));
  assert(!state.calls.some(c=>c.rpc==='customer_food_confirm'));
  await click(button('ยืนยันสั่งและแสดง QR')); assert(state.calls.some(c=>c.rpc==='customer_food_confirm')); assert(host.textContent.includes('ออเดอร์ #321')); await unmount();
  sessionStorage.clear(); setup(); global.__deliveryTest.profile=null; await mount(ui.QuickFoodOrder); await addRice(); await click(button('ดูตะกร้า')); await click(button('สรุปยอดและค่าส่ง')); assert(global.__deliveryTest.next.startsWith('/liff/register?next=')); assert(!state.calls.some(c=>c.rpc==='customer_food_review')); await unmount();
  console.log('PASS quick LINE checkout: silent immediate edits, explicit summary, shipping, saved point, explicit confirm and first-customer signup redirect');

  sessionStorage.clear(); setup(); await mount(ui.QuickFoodOrder);
  await addRice(); await click(button('ดูตะกร้า')); await click(button('สรุปยอดและค่าส่ง'));
  state.loseConfirm=true; await click(button('ยืนยันสั่งและแสดง QR'));
  assert(host.textContent.includes('กดซ้ำได้')); assert.equal(state.tables.orders.length,1);
  const token=state.calls.find(c=>c.rpc==='customer_food_confirm').args.p_token;
  await unmount(); await mount(ui.QuickFoodOrder); await click(button('ดูตะกร้า')); assert(button('ยืนยันสั่งและแสดง QR'));
  await click(button('ยืนยันสั่งและแสดง QR'));
  assert.equal(state.tables.orders.length,1); assert.equal(state.calls.filter(c=>c.rpc==='customer_food_review').length,1);
  assert(state.calls.filter(c=>c.rpc==='customer_food_confirm').every(c=>c.args.p_token===token));
  assert(host.textContent.includes('ออเดอร์ #321')); await unmount();
  console.log('PASS lost confirm response: reload preserves quote token and retries without another review/order');

  sessionStorage.clear(); setup({ menu_items: [{ ...item, is_available: false }] }); await mount(ui.QuickFoodOrder);
  assert(host.querySelector('[aria-label="ใส่ ข้าวผัด ลงตะกร้า"]').disabled); assert(host.textContent.includes('หมดชั่วคราว')); await addRice(); assert.equal(riceQty(), undefined); await unmount();
  // ร้านปิด: ลองใส่ตะกร้าได้ แต่ปุ่มสรุปยอดกดไม่ได้
  sessionStorage.clear(); setup({ merchants: [{ ...shop, is_open: false }] }); await mount(ui.QuickFoodOrder);
  assert(host.textContent.includes('ปิดอยู่')); await addRice(); await click(button('ดูตะกร้า')); assert(button('ร้านปิดอยู่ · ยังสั่งไม่ได้').disabled); await unmount();
  // ร้านยังไม่ปักหมุด: คิดค่าส่งไม่ได้ จึงใส่ตะกร้าไม่ได้เลย
  sessionStorage.clear(); setup(); state.noPin = true; await mount(ui.QuickFoodOrder);
  assert(host.textContent.includes('ยังสั่งไม่ได้ ร้านยังไม่ได้ปักหมุด')); assert(host.querySelector('[aria-label="ใส่ ข้าวผัด ลงตะกร้า"]').disabled); await addRice(); assert.equal(riceQty(), undefined); await unmount();
  sessionStorage.clear(); setup(); await mount(ui.QuickFoodOrder); await addRice(); await click(host.querySelector('[aria-label="เพิ่ม ข้าวผัด"]'));
  await unmount(); await mount(ui.QuickFoodOrder); assert.equal(riceQty(), '2');
  await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); await click(host.querySelector('[aria-label="ลด ข้าวผัด"]')); assert.equal(riceQty(), undefined); assert(host.querySelector('[aria-label="ใส่ ข้าวผัด ลงตะกร้า"]')); await unmount();
  console.log('PASS menu row feedback: sold-out/closed/no-pin guards, saved quantities and decrement to zero brings back the add button');

  setup(); global.__deliveryTest.profile=null; await mount(ui.RegisterCustomer);
  const signupFields=host.querySelectorAll('form input'); await value(signupFields[0],'ลูกค้าทดสอบ'); await value(signupFields[1],'0812345678');
  await React.act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  const signup=state.calls.find(c=>c.rpc==='register_line_customer'); assert(signup,host.textContent); assert.equal(signup.args.p_name,'ลูกค้าทดสอบ'); assert.equal(signup.args.p_tambon_id,'area'); assert(!('role' in signup.args)); assert.equal(global.__deliveryTest.next,'/liff'); await unmount();
  setup(); await mount(ui.RegisterCustomer); assert.equal(global.__deliveryTest.next,'/liff'); await unmount();
  console.log('PASS customer signup: name/phone/area submission, no role escalation and complete returning customer skips form');

  const played=[];
  global.AudioContext=class {
    state='running'; currentTime=0; destination={};
    async resume() { this.state='running'; } async close() { this.state='closed'; }
    createGain() { return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}; }
    createDynamicsCompressor() { return {threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){},disconnect(){}}; }
    createOscillator() { const tone={frequency:{value:0},connect(){},disconnect(){},start(at){this.at=at;},stop(at){this.stopped=at===undefined;}};played.push(tone);return tone; }
  };
  const wakeLocks=[],vibrations=[];
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async kind=>{const lock={kind,released:false,release:async()=>{lock.released=true;}};wakeLocks.push(lock);return lock;}}});
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{vibrations.push(pattern);return true;}});
  let visibility='visible'; Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
  localStorage.clear(); setup(); await mount(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1]});
  assert.equal(played.length,0,'opening jobs never autoplays');
  assert(button('แตะเพื่อเปิดเสียงแจ้งเตือนงานใหม่'),'one big tap-to-enable button');
  await value(host.querySelector('select'),'chime');
  const settingsInputs=host.querySelectorAll('input[type="number"]');
  await value(settingsInputs[0],'4');await value(settingsInputs[1],'3');await value(settingsInputs[2],'5');
  await click(button('ทดลองเสียง')); assert.equal(played.length,40); assert(played[10].at>8,'five-second gap between three-second rounds');
  await click(button('หยุดเสียงรอบนี้')); assert(played.every(t=>t.stopped));
  await React.act(async()=>root.render(React.createElement(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1,2]})));
  assert.equal(played.length,80,'one new job rings');
  await React.act(async()=>root.render(React.createElement(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1,2]})));
  assert.equal(played.length,80,'same jobs do not ring twice');
  await React.act(async()=>root.render(React.createElement(ui.JobSound,{scope:'shop-user',streamScope:'other-filter',kind:'merchant',ids:[1,2,3]})));
  assert.equal(played.length,80,'changing filter does not announce older jobs');
  visibility='hidden';await React.act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));assert(played.every(t=>t.stopped));await unmount();
  await mount(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1,2]});assert.equal(host.querySelector('input[type="number"]').value,'4');assert(button('เริ่มฟังเสียงงานใหม่'));await unmount();
  await mount(ui.JobSound,{scope:'rider-user',kind:'driver',ids:[1]});assert.equal(host.querySelector('select').value,'voice');assert.equal(host.querySelector('input[type="number"]').value,'3');await unmount();visibility='visible';
  // tap anywhere resumes sound that was enabled before; the screen is held awake while enabled; the phone buzzes with each ring
  assert(vibrations.length>=2,'ringing vibrates');assert(wakeLocks.some(l=>l.kind==='screen'),'screen is kept on while sound is enabled');
  assert.equal(localStorage.getItem('job-sound:on:merchant:shop-user'),'1');
  await mount(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1,2]});
  assert(button('แตะ 1 ครั้งเพื่อเริ่มฟังเสียงงานใหม่'),'remembered: asks for one tap anywhere');const before=played.length;
  await React.act(async()=>document.body.dispatchEvent(new window.Event('pointerdown',{bubbles:true})));
  assert(host.textContent.includes('เปิดอยู่'),'one tap anywhere re-enables sound');assert.equal(played.length,before,'re-enabling is silent');
  await click(button('ปิดเสียงงานใหม่'));assert.equal(localStorage.getItem('job-sound:on:merchant:shop-user'),null,'turning off forgets');
  assert(wakeLocks.every(l=>l.released),'screen lock released when sound is off');await unmount();
  // owner's read-only "view as": every control in the page is disabled except the sound card, which moves into the fieldset's legend
  global.__deliveryTest.viewAs=true;
  await React.act(async()=>{root=createRoot(host);root.render(React.createElement('fieldset',{disabled:true},React.createElement('legend',null,React.createElement('div',{id:'sound-slot'})),React.createElement('button',{id:'other'},'อื่น'),React.createElement(ui.JobSound,{scope:'shop-user',kind:'merchant',ids:[1]})));});
  await React.act(async()=>{});
  assert(host.querySelector('#other').matches(':disabled'),'view-as keeps the page read-only');
  const slotButton=button('เริ่มฟังเสียงงานใหม่')||button('แตะเพื่อเปิดเสียง');
  assert(slotButton&&host.querySelector('#sound-slot').contains(slotButton)&&!slotButton.matches(':disabled'),'sound card is usable while viewing as someone else');
  await unmount();global.__deliveryTest.viewAs=false;
  console.log('PASS custom job sound: rounds/duration/gaps, device preferences, role tones, new jobs only, stop and hidden-page cleanup');


  setup(); state.fail = true; await mount(ui.CustomerCatalog); assert(host.querySelector('[role="alert"]')); assert(!host.textContent.includes('ยังไม่มีร้านเปิด')); state.fail = false; await click(button('ลองอีกครั้ง')); assert(host.textContent.includes('ร้านจำลอง')); await unmount();
  setup({ tambons: [area, { ...area, id: 'unmanaged', name: 'ตำบลที่ไม่มีสิทธิ์' }] }); global.__deliveryTest.profile = { ...profile, role: 'admin' }; await mount(ui.AdminOverview); assert(!host.textContent.includes('ตำบลที่ไม่มีสิทธิ์')); assert(host.textContent.includes('ยังไม่ตั้งค่าส่ง 1 ตำบล')); assert(host.textContent.includes('0 บาท')); await unmount();
  setup(); await mount(ui.ServiceRequest, { type: 'parcel' }); assert(button('ตรวจรายละเอียด').disabled); const addresses = host.querySelectorAll('textarea'); await value(addresses[0], 'ร้านจำลอง จุดรับ'); await value(addresses[1], 'บ้านจำลอง จุดส่ง'); await React.act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); assert(host.querySelector('a[href*="line.me"]')); assert(!state.calls.some(c => c.operation === 'insert')); await unmount();
  setup(); await mount(ui.AppShell, { role: 'customer', children: React.createElement('h1', null, 'ทดสอบเนื้อหา') }); await click(host.querySelector('[aria-label="เปิดเมนูทั้งหมด"]')); assert(host.querySelector('dialog').open); await click(host.querySelector('[aria-label="ปิดเมนู"]')); assert(!host.querySelector('dialog').open); await unmount();
  console.log('PASS retry, admin setup warning, service request review and mobile menu controls');
})().catch(error => { console.error(error); process.exitCode = 1; });
