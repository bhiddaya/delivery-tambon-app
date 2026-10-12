// Offline account-switch UI regression. No real credentials or network calls.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(base,'package.json'));
const qa=process.env.DELIVERY_QA_TOOLS?createRequire(path.join(process.env.DELIVERY_QA_TOOLS,'package.json')):require;
const {JSDOM}=qa('jsdom');const esbuild=qa('esbuild');
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/login'});
const location={search:'?next=%2Fadmin%2Fworkspace%3Ft%3Dkhalong-kum',assign:p=>state.navigations.push(p)};
global.window=new Proxy(dom.window,{get(target,key){if(key==='location')return location;return Reflect.get(target,key,target);}});
global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const React=require('react');const {createRoot}=require('react-dom/client');
const out=path.join(base,'node_modules/.cache/login-account-switch.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await esbuild.build({stdin:{contents:"export {default as Login} from './src/app/login/page';",resolveDir:base,loader:'tsx'},absWorkingDir:base,bundle:true,platform:'node',format:'cjs',outfile:out,tsconfig:path.join(base,'tsconfig.json'),external:['react','react/jsx-runtime'],plugins:[{name:'offline-auth',setup(b){
 b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'db',namespace:'mock'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'mock'}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));
 b.onResolve({filter:/^@\/components\/(AuthFrame|TambonHeading|LineLoginButton)$/},a=>({path:a.path.split('/').pop(),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path:p})=>({contents:p==='db'?'export const createClient=()=>globalThis.__loginDb;':p==='navigation'?'export const useRouter=()=>globalThis.__loginRouter;':p==='AuthFrame'?'export const AuthFrame=({children})=>children;':p==='TambonHeading'?'export const TambonHeading=()=>null;':p==='LineLoginButton'?'export default function LineLoginButton(){return null;}':'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',loader:'js'}));
}}]});
const {Login}=require(out);const host=document.getElementById('root');let state,root;
function setup(){state={navigations:[],pushes:[],replaces:[],signouts:[],signins:[],failSignout:false,failSignin:false};
 global.__loginRouter={push:p=>state.pushes.push(p),replace:p=>state.replaces.push(p),refresh(){}};
 global.__loginDb={auth:{getUser:async()=>({data:{user:{email:'old-account@example.test'}}}),signOut:async args=>{state.signouts.push(args);return{error:state.failSignout?{message:'unavailable'}:null};},signInWithPassword:async args=>{state.signins.push(args);return{error:state.failSignin?{message:'Invalid login credentials'}:null};}}};
 location.search='?next=%2Fadmin%2Fworkspace%3Ft%3Dkhalong-kum';
}
const tick=async()=>React.act(async()=>{await new Promise(r=>setTimeout(r,5));});
const mount=async()=>{root=createRoot(host);await React.act(async()=>root.render(React.createElement(Login)));await tick();};
const unmount=async()=>React.act(async()=>root.unmount());
const button=t=>[...host.querySelectorAll('button')].find(b=>b.textContent===t);
const click=async e=>{assert(e);await React.act(async()=>e.click());await tick();};
async function value(e,v){Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(e,v);await React.act(async()=>e.dispatchEvent(new dom.window.Event('input',{bubbles:true})));}
async function submit(){await value(host.querySelector('input[type="text"]'),'new-account@example.test');await value(host.querySelector('input[type="password"]'),'offline-test-value');await React.act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await tick();}

setup();await mount();assert(host.textContent.includes('old-account@example.test'));assert.equal(state.replaces.length,0);assert.equal(state.pushes.length,0);assert(host.querySelector('form'));await click(button('ใช้บัญชีปัจจุบันต่อ'));assert.deepEqual(state.pushes,['/admin/workspace?t=khalong-kum']);await unmount();console.log('PASS existing session stays on login and explicit continue preserves requested area');

setup();state.failSignout=true;await mount();await click(button('เปลี่ยนบัญชี'));assert(host.textContent.includes('เปลี่ยนบัญชีไม่สำเร็จ'));assert(host.textContent.includes('old-account@example.test'));state.failSignout=false;await click(button('เปลี่ยนบัญชี'));assert(!host.textContent.includes('old-account@example.test'));assert.deepEqual(state.signouts,[{scope:'local'},{scope:'local'}]);assert.equal(document.activeElement.id,'login-identifier');assert.equal(state.navigations.length,0);await unmount();console.log('PASS failed switch retains account; retry signs out only this session and focuses identifier');

setup();await mount();await submit();assert.equal(state.signins[0].email,'new-account@example.test');assert.deepEqual(state.navigations,['/admin/workspace?t=khalong-kum']);assert.equal(state.pushes.length,0);await unmount();console.log('PASS password account change makes fresh navigation to requested area');

setup();state.failSignin=true;await mount();await submit();assert(host.textContent.includes('อีเมลหรือรหัสผ่านไม่ถูกต้อง'));assert.equal(state.navigations.length,0);await unmount();console.log('PASS failed password leaves login visible without navigating');

setup();location.search='?next=https%3A%2F%2Fevil.invalid';await mount();await submit();assert.deepEqual(state.navigations,['/']);await unmount();console.log('PASS external return path rejected during account switch');

