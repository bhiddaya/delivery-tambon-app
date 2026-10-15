import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(base,'package.json'));
const qa=createRequire(path.join(process.env.DELIVERY_QA_TOOLS||base,'package.json'));
const esbuild=qa('esbuild'),{JSDOM}=qa('jsdom'),React=require('react');
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/liff/entry'});
const navigations=[];
global.document=dom.window.document;
global.window={document,location:{replace:p=>navigations.push(p),reload(){}},HTMLIFrameElement:dom.window.HTMLIFrameElement};
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=require('react-dom/client');
const out=path.join(base,'node_modules/.cache/line-role-entry.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await esbuild.build({stdin:{contents:"export {default as Entry} from './src/components/LineRoleEntry'; export {requireRole} from './src/lib/auth-guard'; export {lineEntryRole} from './src/lib/line-entry';",resolveDir:base,loader:'tsx'},absWorkingDir:base,bundle:true,platform:'node',format:'cjs',outfile:out,external:['react','react/jsx-runtime'],plugins:[{name:'auth-fixtures',setup(b){
 const names={'@/lib/use-line-session':'line','@/lib/supabase/client':'client','@/lib/supabase/server':'server','next/navigation':'nav','next/headers':'headers','next/link':'link'};
 b.onResolve({filter:/^(?:@\/lib\/(?:use-line-session|supabase\/(?:client|server))|next\/(?:navigation|headers|link))$/},a=>({path:names[a.path],namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:({
  line:'export const useLineSession=()=>globalThis.fixtureLine;',
  client:'export const createClient=()=>globalThis.fixtureClient;',
  server:'export const isSupabaseConfigured=()=>true; export const createClient=async()=>globalThis.fixtureServer;',
  nav:'export const redirect=p=>{throw new Error("REDIRECT:"+p)};',
  headers:'export const cookies=async()=>({get:()=>null});',
  link:'import React from "react";export default function Link({children,...p}){return React.createElement("a",p,children)}',
 })[a.path]}));
}}]});
const {Entry,requireRole,lineEntryRole}=require(out);const host=document.getElementById('root');let root;
const tick=async()=>React.act(async()=>{await new Promise(r=>setTimeout(r,5));});
const mount=async requested=>{root=createRoot(host);await React.act(async()=>root.render(React.createElement(Entry,{requested})));await tick();};
const unmount=async()=>React.act(async()=>root.unmount());
let loginCalls,scopeCount,scopeError;
function setup(role='customer'){
 navigations.length=0;loginCalls=0;scopeCount=0;scopeError=null;
 global.fixtureLine={ready:true,profile:{id:'qa-account',role,approved:true,suspended_at:null},error:'',liff:{status:'ready',isLoggedIn:true,getIdToken:()=> 'verified-token-fixture',login:()=>loginCalls++,relogin(){}}};
 global.fixtureClient={from:()=>({select:()=>({eq:async()=>({count:scopeCount,error:scopeError})})})};
}
for(const [role,target] of [['superadmin','/admin/workspace'],['admin','/admin/workspace'],['merchant','/merchant/orders'],['driver','/driver'],['customer','/customer']]){
 setup(role);await mount('auto');assert.deepEqual(navigations,[target]);assert.equal(host.querySelectorAll('input[type="password"]').length,0);await unmount();
}
// the owner has no shop or rider page of their own: those buttons open a test account's read-only page, never the agent page for all three
setup('superadmin');await mount('merchant');assert.deepEqual(navigations,['/view-as?demo=merchant']);await unmount();
setup('superadmin');await mount('driver');assert.deepEqual(navigations,['/view-as?demo=driver']);await unmount();
setup('superadmin');await mount('admin');assert.deepEqual(navigations,['/admin/workspace']);await unmount();
// a button for a role the account does not hold explains why (and how to apply) instead of silently opening another page
for(const [role,requested,text] of [['customer','merchant','ยังไม่ได้เป็นร้านค้า'],['customer','driver','ยังไม่ได้เป็นไรเดอร์'],['customer','admin','ยังไม่ได้เป็นตัวแทนตำบล'],['driver','merchant','ยังไม่ได้เป็นร้านค้า'],['merchant','driver','ยังไม่ได้เป็นไรเดอร์'],['admin','merchant','ยังไม่ได้เป็นร้านค้า']]){
 setup(role);await mount(requested);assert.equal(navigations.length,0,role+' pressing '+requested);assert(host.textContent.includes(text));await unmount();
}
setup('customer');await mount('merchant');assert(host.querySelector('a[href*="oaMessage"]'),'apply link opens the OA chat');assert(host.querySelector('a[href="/customer"]'),'link back to own home');await unmount();
setup('customer');await mount('customer');assert.deepEqual(navigations,['/customer']);await unmount();
setup('driver');await mount('driver');assert.deepEqual(navigations,['/driver']);await unmount();
console.log('PASS five stored roles enter their own home without a password form');
setup('merchant');scopeCount=1;await mount('admin');assert.deepEqual(navigations,['/admin/workspace']);await unmount();
setup('merchant');scopeError={message:'offline'};await mount('admin');assert.equal(navigations.length,0);assert(host.querySelector('[role="alert"]'));await unmount();
console.log('PASS requested menu never grants role; appointed merchant may enter admin and lookup failure fails closed');
setup('superadmin');fixtureLine.ready=false;fixtureLine.error='LINE verification rejected';await mount('admin');assert.equal(navigations.length,0);assert(host.querySelector('[role="alert"]'));await unmount();
setup('admin');fixtureLine.ready=false;await mount('admin');assert.equal(navigations.length,0);await unmount();
console.log('PASS unverified LINE and an unready exchange never continue a stale privileged browser account');
setup();fixtureLine.ready=false;fixtureLine.liff.isLoggedIn=false;await mount('auto');assert.equal(loginCalls,1);await unmount();
setup();fixtureLine.ready=false;fixtureLine.liff.getIdToken=()=>null;await mount('auto');assert(host.textContent.includes('อนุญาตผ่าน LINE'));assert.equal(navigations.length,0);await unmount();
setup();fixtureLine.profile=null;await mount('auto');assert.deepEqual(navigations,['/onboarding']);await unmount();
setup('admin');fixtureLine.profile.suspended_at='2026-10-14';await mount('admin');assert.deepEqual(navigations,['/account']);await unmount();
console.log('PASS initial consent, unknown and suspended accounts have explicit nonprivileged paths');
assert.equal(lineEntryRole('superadmin'),'admin');assert.equal(lineEntryRole('agent'),'admin');assert.equal(lineEntryRole('https://evil.invalid'),'auto');

let valid=true,rpcError=null;
function server(role,scopes=0){
 const profile={id:'qa-account',role};
 global.fixtureServer={auth:{getUser:async()=>({data:{user:{id:profile.id,email:null}}})},
  from:table=>({select:()=>table==='profiles'?{eq:()=>({maybeSingle:async()=>({data:profile})})}:{eq:async()=>({count:scopes})}}),
  rpc:async name=>{assert.equal(name,'backoffice_session_valid');return{data:valid,error:rpcError}}};
}
server('admin');assert.equal((await requireRole('admin')).profile.role,'admin');
server('merchant',1);assert.equal((await requireRole('admin')).profile.role,'merchant');
server('customer');await assert.rejects(requireRole('admin'),/REDIRECT:\/customer/);
for(const value of [false,null]){valid=value;server('admin');await assert.rejects(requireRole('admin'),/REDIRECT:\/login/);}
valid=true;rpcError={message:'unavailable'};server('admin');await assert.rejects(requireRole('admin'),/REDIRECT:\/login/);
console.log('PASS server guards preserve stored role/scopes and reject revoked, unknown or failed session checks');
