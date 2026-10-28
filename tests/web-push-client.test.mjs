// Offline test of the Web Push client: service worker handlers and the subscribe flow. Browser APIs are fakes; no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const qa = createRequire(path.join(process.env.DELIVERY_QA_TOOLS || base, 'package.json'));
const esbuild = qa('esbuild');
const require = createRequire(path.join(base, 'package.json'));

// ---- service worker: show the notification the server asked for, open the right page on tap
const listeners = {}; const shown = []; const opened = []; const focused = []; const navigated = [];
let windows = [];
const self_ = {
  addEventListener: (type, fn) => { listeners[type] = fn; },
  registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
  clients: { matchAll: async () => windows, openWindow: async (url) => { opened.push(url); }, claim: async () => {} },
  location: { origin: 'https://app.test' }, skipWaiting() {},
};
vm.runInNewContext(fs.readFileSync(path.join(base, 'public/sw.js'), 'utf8'), { self: self_, URL, caches: {}, fetch: async () => {} });
const fire = async (type, event) => { const waits = []; await listeners[type]({ ...event, waitUntil: p => waits.push(p) }); await Promise.all(waits); };

await fire('push', { data: { json: () => ({ title: '🛒 ออเดอร์ใหม่ #7', body: 'รอตัวแทนยืนยันเงิน', tag: 'order-7-merchant', vibrate: [300, 100, 300], url: '/merchant/orders' }) } });
assert.equal(shown[0].title, '🛒 ออเดอร์ใหม่ #7');
assert.deepEqual({ tag: shown[0].options.tag, renotify: shown[0].options.renotify, requireInteraction: shown[0].options.requireInteraction, vibrate: shown[0].options.vibrate, url: shown[0].options.data.url },
  { tag: 'order-7-merchant', renotify: true, requireInteraction: true, vibrate: [300, 100, 300], url: '/merchant/orders' });
await fire('push', { data: { json: () => { throw new Error('not json'); }, text: () => 'ข้อความเปล่า' } });
assert.equal(shown[1].title, 'บวรไทย'); assert.equal(shown[1].options.body, 'ข้อความเปล่า'); assert.equal(shown[1].options.renotify, false);
await fire('push', {});
assert.equal(shown[2].title, 'บวรไทย');

const tap = (url) => ({ notification: { close() { tap.closed++; }, data: { url } } }); tap.closed = 0;
await fire('notificationclick', tap('/driver')); // no window open -> open a new one
assert.deepEqual(opened, ['https://app.test/driver']); assert.equal(tap.closed, 1);
windows = [{ url: 'https://app.test/driver', focus: async () => { focused.push('same'); } }];
await fire('notificationclick', tap('/driver')); // the page is already open -> focus it
assert.deepEqual(focused, ['same']);
windows = [{ url: 'https://app.test/other', focus: async () => { focused.push('other'); }, navigate: async (u) => { navigated.push(u); } }];
await fire('notificationclick', tap('/admin/workspace')); // another page of the app is open -> reuse it
assert.deepEqual(navigated, ['https://app.test/admin/workspace']); assert.equal(focused.at(-1), 'other');

// ---- subscribe flow
const out = path.join(base, 'node_modules/.cache/web-push-client.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(base, 'src/lib/web-push.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, tsconfig: path.join(base, 'tsconfig.json'),
  plugins: [{ name: 'db', setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ loader: 'js', contents: 'export const createClient = () => globalThis.fakeDb;' }));
  } }],
});
const web = require(out);

function browser({ permission = 'default', ask = 'granted', existing = null, key = 'BPk_-w', saveError = null } = {}) {
  const rpc = []; const subscribeArgs = []; let removed = false;
  const subscription = (endpoint) => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: async () => { removed = true; } });
  const registration = { pushManager: {
    getSubscription: async () => existing ? subscription(existing) : null,
    subscribe: async (args) => { subscribeArgs.push(args); return subscription('https://push.example/new'); },
  } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome', serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } } });
  globalThis.window = { PushManager: {}, Notification: {} };
  globalThis.Notification = { permission, requestPermission: async () => ask };
  globalThis.fakeDb = { rpc: async (name, args) => {
    rpc.push([name, args]);
    if (name === 'push_public_key') return { data: key, error: null };
    return { data: null, error: saveError };
  } };
  return { rpc, subscribeArgs, removed: () => removed };
}

let b = browser();
assert.equal(web.pushSupported(), true);
assert.equal(await web.pushState(), 'off');
assert.equal(await web.enablePush('driver'), 'on');
assert.deepEqual(Array.from(b.subscribeArgs[0].applicationServerKey), [4, 249, 63, 251], 'the server public key is passed as bytes');
assert.equal(b.subscribeArgs[0].userVisibleOnly, true);
assert.deepEqual(b.rpc.at(-1), ['push_save_subscription', { p_endpoint: 'https://push.example/new', p_p256dh: 'P', p_auth: 'A', p_kind: 'driver', p_user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome' }]);

b = browser({ existing: 'https://push.example/old', permission: 'granted' });
assert.equal(await web.pushState(), 'on');
assert.equal(await web.enablePush('agent'), 'on'); assert.equal(b.subscribeArgs.length, 0, 'an existing device subscription is reused and only re-saved');
assert.equal(b.rpc.at(-1)[1].p_endpoint, 'https://push.example/old'); assert.equal(b.rpc.at(-1)[1].p_kind, 'agent');
await web.disablePush();
assert.deepEqual(b.rpc.at(-1), ['push_remove_subscription', { p_endpoint: 'https://push.example/old' }]); assert.equal(b.removed(), true);

b = browser({ ask: 'denied' });
assert.equal(await web.enablePush('merchant'), 'denied'); assert.equal(b.rpc.length, 0, 'nothing is saved without permission');
b = browser({ permission: 'denied' });
assert.equal(await web.pushState(), 'denied');
b = browser({ key: null });
assert.equal(await web.enablePush('merchant'), 'error', 'server keys not created yet');
b = browser({ saveError: { message: 'boom' } });
assert.equal(await web.enablePush('merchant'), 'error');

// inside the Android app "บวรไทย": the app's Firebase token is saved instead of a browser subscription
{
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  b = browser();
  globalThis.window = { BavornthaiApp: { fcmToken: () => 'app-token-0123456789' } }; // WebView: no PushManager/Notification
  assert.equal(web.pushSupported(), true);
  assert.equal(await web.pushState(), 'off');
  assert.equal(await web.enablePush('merchant'), 'on');
  assert.deepEqual(b.rpc.at(-1), ['push_save_app_token', { p_token: 'app-token-0123456789', p_kind: 'merchant', p_user_agent: 'Mozilla/5.0 (Linux; Android 14) Chrome' }]);
  assert.equal(b.subscribeArgs.length, 0, 'no browser subscription inside the app');
  assert.equal(await web.pushState(), 'on');
  await web.disablePush();
  assert.deepEqual(b.rpc.at(-1), ['push_remove_app_token', { p_token: 'app-token-0123456789' }]);
  assert.equal(await web.pushState(), 'off');
  globalThis.window = { BavornthaiApp: { fcmToken: () => '' } };
  assert.equal(await web.enablePush('driver'), 'error', 'app has no Firebase token yet');
  b = browser({ saveError: { message: 'boom' } });
  globalThis.window = { BavornthaiApp: { fcmToken: () => 'app-token-0123456789' } };
  assert.equal(await web.enablePush('driver'), 'error'); assert.equal(await web.pushState(), 'off');
}

// app device name for the Super app drill page: sent once with the app's token, nothing outside the app
{
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push({ url, init }); return {}; };
  globalThis.window = { BavornthaiApp: { fcmToken: () => 'app-token-0123456789' } };
  web.nameAppDevice('ร้านค้า: ป้าแดง');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://bavornthai-superapp.bhiddaya.workers.dev/api/subscribe-fcm');
  assert.equal(posts[0].init.mode, 'no-cors');
  assert.deepEqual(JSON.parse(posts[0].init.body), { token: 'app-token-0123456789', name: 'ร้านค้า: ป้าแดง' });
  globalThis.window = {}; web.nameAppDevice('ร้านค้า: ป้าแดง');
  globalThis.window = { BavornthaiApp: { fcmToken: () => '' } }; web.nameAppDevice('ร้านค้า: ป้าแดง');
  assert.equal(posts.length, 1, 'no token or no app: nothing sent');
}

// browsers without push (LINE in-app browser, iPhone outside the home screen)
globalThis.window = {}; assert.equal(web.pushSupported(), false); assert.equal(await web.pushState(), 'unsupported'); assert.equal(await web.enablePush('driver'), 'unsupported');
assert.equal(web.unsupportedHelp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios-install');
assert.equal(web.unsupportedHelp('Mozilla/5.0 (Linux; Android 14) Line/14.0'), 'open-browser');
assert.deepEqual(Array.from(web.keyToBytes('AQID')), [1, 2, 3]);
assert.deepEqual(Array.from(web.keyToBytes('-_8')), [251, 255]);
console.log('PASS web push client: notification shown and opened correctly, subscribe/unsubscribe flow, unsupported browsers explained');
