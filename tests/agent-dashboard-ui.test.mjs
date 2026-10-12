// Offline interactions only. No accounts, orders, messages or memory writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const base=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(base,'package.json'));
const qa=process.env.DELIVERY_QA_TOOLS?createRequire(path.join(process.env.DELIVERY_QA_TOOLS,'package.json')):require;
const {JSDOM}=qa('jsdom');const esbuild=qa('esbuild');const React=require('react');
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/admin/workspace'});
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const {createRoot}=require('react-dom/client');
const realTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===1500?0:ms,...args);
const areas=[{id:'area-a',name:'พื้นที่ ก',slug:'a'},{id:'area-b',name:'พื้นที่ ข',slug:'b'}];
const countKeys=['today_orders','active_orders','delivered_today','awaiting_payment','pending_payouts','payout_amount','shops','open_shops','online_drivers','pending_members','open_messages'];
let state;
function setup(){state={tasks:[],events:[],calls:[],requests:new Set(),failSave:false,failUpdate:false};
 global.__agentDb={auth:{getSession:async()=>({data:{session:{access_token:'mock-jwt'}},error:null})},channel(){const c={on(){return c},subscribe(){}};return c},removeChannel:async()=>{},async rpc(name,args){state.calls.push({name,args:structuredClone(args)});
  if(name==='agent_dashboard_areas')return{data:areas,error:null};
  if(name==='agent_dashboard'){const all=state.tasks.filter(t=>t.tambon_id===args.p_tambon_id);return{data:{area:areas.find(a=>a.id===args.p_tambon_id),counts:Object.fromEntries(countKeys.map(k=>[k,0])),task_counts:Object.fromEntries(['todo','doing','waiting','done'].map(s=>[s,all.filter(t=>t.status===s).length])),tasks:all.filter(t=>args.p_status==='open'?t.status!=='done':t.status===args.p_status),events:state.events,orders:[]},error:null};}
  if(name==='agent_work_save'){
   if(!state.requests.has(args.p_request_id)){state.requests.add(args.p_request_id);state.tasks.push({id:args.p_request_id,tambon_id:args.p_tambon_id,title:args.p_title,detail:args.p_detail,category:args.p_category,status:'todo',version:1,due_on:null,order_id:args.p_order_id,updated_at:new Date().toISOString()});}
   if(state.failSave){state.failSave=false;return{data:null,error:{code:'NETWORK',message:'lost'}}}return{data:{ok:true},error:null};
  }
  if(name==='agent_work_update'){
   if(state.failConflict){state.failConflict=false;return{data:null,error:{code:'PT409',message:'stale version'}};}
   if(!state.requests.has(args.p_request_id)){state.requests.add(args.p_request_id);const t=state.tasks.find(t=>t.id===args.p_task_id);t.status=args.p_action==='done'?'done':args.p_action==='wait'?'waiting':args.p_action==='start'?'doing':'todo';t.version++;state.events.push({id:args.p_request_id,task_id:t.id,status:t.status,action:args.p_action,note:args.p_note,created_at:new Date().toISOString()});}
   if(state.failUpdate){state.failUpdate=false;return{data:null,error:{code:'NETWORK',message:'lost'}}}return{data:{ok:true},error:null};
  }throw Error(name);
 }};
 global.fetch=async()=>Response.json({verified:true,checked_at:new Date().toISOString(),revision:'mock'});
}
const out=path.join(base,'node_modules/.cache/agent-dashboard-ui.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await esbuild.build({stdin:{contents:"export {default as Dashboard} from './src/components/AgentDashboard';",resolveDir:base,loader:'tsx'},absWorkingDir:base,bundle:true,platform:'node',format:'cjs',outfile:out,tsconfig:path.join(base,'tsconfig.json'),external:['react','react/jsx-runtime'],plugins:[{name:'offline',setup(b){b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'db',namespace:'mock'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},({path:p})=>({contents:p==='db'?'export const createClient=()=>globalThis.__agentDb;':'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',loader:'js'}));}}]});
const {Dashboard}=require(out);let root;const host=document.getElementById('root');
const tick=async()=>React.act(async()=>{await new Promise(r=>setTimeout(r,5));});
const mount=async()=>{root=createRoot(host);await React.act(async()=>root.render(React.createElement(Dashboard)));await tick();};
const click=async e=>{assert(e);await React.act(async()=>e.click());await tick();};
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
async function value(e,v){assert(e);const p=e.tagName==='SELECT'?window.HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,v);await React.act(async()=>e.dispatchEvent(new window.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})));}
const unmount=async()=>React.act(async()=>root.unmount());

setup();await mount();assert(host.textContent.includes('พื้นที่ ก'));assert(host.querySelector('a[href="/finance?t=a"]'));assert(!host.textContent.includes('n8n'));await click(button('บันทึกงานใหม่'));await value(host.querySelector('input[maxlength="160"]'),'ประสานร้านวันนี้');await click(button('บันทึกงาน'));assert(host.textContent.includes('ประสานร้านวันนี้'));assert.equal(state.tasks.length,1);await click(button('เริ่มทำ'));assert.equal(state.tasks[0].status,'doing');assert(host.textContent.includes('กำลังทำ'));await unmount();console.log('PASS agent operations: scoped links, save and immediate refreshed status');

setup();state.failSave=true;await mount();await click(button('บันทึกงานใหม่'));await value(host.querySelector('input[maxlength="160"]'),'ติดตามงานจำลอง');await click(button('บันทึกงาน'));assert.equal(state.tasks.length,1);assert(host.querySelector('input[maxlength="160"]').matches(':disabled'));await click(button('ลองบันทึกเดิมอีกครั้ง'));assert.equal(state.tasks.length,1);const saves=state.calls.filter(c=>c.name==='agent_work_save');assert.equal(saves.length,2);assert.equal(saves[0].args.p_request_id,saves[1].args.p_request_id);await unmount();console.log('PASS lost create response: frozen input and same request ID retry');

setup();state.tasks=[{id:'task-a',tambon_id:'area-a',title:'งานเฉพาะพื้นที่ ก',detail:'local note',category:'orders',status:'todo',version:1,due_on:null,order_id:null,updated_at:new Date().toISOString()}];state.failUpdate=true;await mount();await click(button('เริ่มทำ'));assert.equal(state.events.length,1);await click(button('ลองบันทึกเดิมอีกครั้ง'));const updates=state.calls.filter(c=>c.name==='agent_work_update');assert.equal(updates[0].args.p_request_id,updates[1].args.p_request_id);assert.equal(state.events.length,1);await value(host.querySelector('select'),'area-b');await tick();assert(!host.textContent.includes('งานเฉพาะพื้นที่ ก'));assert(host.querySelector('a[href="/finance?t=b"]'));assert(state.calls.some(c=>c.name==='agent_dashboard'&&c.args.p_tambon_id==='area-b'));await unmount();console.log('PASS lost update response and area switch without retained task data');

setup();global.fetch=async()=>Response.json({verified:false},{status:503});await mount();assert(host.textContent.includes('รอเชื่อมสรุปส่วนกลาง'));assert(!host.textContent.includes('✓ เชื่อมสรุปความคืบหน้ากับส่วนกลางแล้ว'));await unmount();console.log('PASS memory outage is shown honestly while local dashboard remains available');

setup();state.tasks=[{id:'conflict-task',tambon_id:'area-a',title:'งานที่มีผู้แก้ไขพร้อมกัน',detail:'',category:'coordination',status:'todo',version:2,due_on:null,order_id:null,updated_at:new Date().toISOString()}];await mount();state.failConflict=true;state.tasks[0].version=3;await click(button('เริ่มทำ'));assert(host.textContent.includes('มีผู้แก้ไขแล้ว'));assert(!button('ลองบันทึกเดิมอีกครั้ง'));assert(!host.querySelector('textarea').disabled);assert.equal(state.events.length,0);assert.equal(state.calls.filter(c=>c.name==='agent_work_update').length,1);await unmount();console.log('PASS stale version conflict refreshes data without frozen retry or duplicate update');

