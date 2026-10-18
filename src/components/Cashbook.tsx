'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session-context';
import { baht, thaiToday, validAmount, type CashbookReport, type CashbookScope } from '@/lib/cashbook';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';

export default function Cashbook({scope}: {scope: CashbookScope}) {
  const {profile}=useSession();
  const [month,setMonth]=useState(()=>thaiToday().slice(0,7));
  const [page,setPage]=useState(0);
  const [report,setReport]=useState<CashbookReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [date,setDate]=useState(thaiToday);
  const [kind,setKind]=useState<'income'|'expense'>('income');
  const [amount,setAmount]=useState('');
  const [category,setCategory]=useState('');
  const [note,setNote]=useState('');
  const [voidId,setVoidId]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const requestId=useRef<string|null>(null);
  const revision=useRef(0);
  const load=useCallback(async()=>{
    const ticket=++revision.current; setLoading(true); setError('');
    try {
      const {data,error}=await createClient().rpc('cashbook_month',{p_scope:scope,p_month:month+'-01',p_page:page});
      if(error) throw error;
      if(ticket===revision.current) setReport(data as unknown as CashbookReport);
    } catch { if(ticket===revision.current){setReport(null);setError('อ่านสมุดบัญชีไม่สำเร็จ กรุณาลองใหม่หรือตรวจสิทธิ์บัญชี');} }
    finally { if(ticket===revision.current) setLoading(false); }
  },[scope,month,page]);
  const invalidate=useCallback(()=>{revision.current++;},[]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return ()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
  async function save(e:FormEvent) {
    e.preventDefault(); if(busy)return;
    if(!validAmount(amount) || !category.trim()){setError('กรอกหมวดหมู่และจำนวนเงินมากกว่าศูนย์ ไม่เกินสองตำแหน่งทศนิยม');return;}
    setBusy(true);setError('');setMessage('');
    requestId.current??=crypto.randomUUID();
    try {
      const {error}=await createClient().rpc('cashbook_record',{p_scope:scope,p_date:date,p_kind:kind,p_amount:Number(amount),p_category:category.trim(),p_note:note,p_request:requestId.current});
      if(error)throw error;
      requestId.current=null;setAmount('');setCategory('');setNote('');setMessage('บันทึกรายการแล้ว');
      if(month!==date.slice(0,7) || page!==0){setMonth(date.slice(0,7));setPage(0);}else await load();
    } catch {setError('บันทึกไม่สำเร็จ กรุณาลองซ้ำด้วยข้อมูลเดิม หากแก้ข้อมูลให้กดเริ่มรายการใหม่');}
    finally {setBusy(false);}
  }
  async function cancel(e:FormEvent) {
    e.preventDefault();if(busy || !voidId || !reason.trim())return;
    setBusy(true);setError('');setMessage('');
    try {
      const {error}=await createClient().rpc('cashbook_void',{p_id:voidId,p_reason:reason.trim()});
      if(error)throw error;
      setVoidId(null);setReason('');setMessage('ยกเลิกรายการแล้ว ประวัติเดิมยังเก็บไว้');await load();
    } catch {setError('ยกเลิกไม่สำเร็จ กรุณาลองใหม่');} finally{setBusy(false);}
  }
  const selectClass='min-h-12 w-full rounded-xl border border-border bg-surface px-4';
  return <div className="space-y-5">
    <h1 className="font-head text-2xl font-semibold">{scope==='personal'?'บัญชีส่วนตัวของฉัน':'บัญชีรายรับ–รายจ่ายโครงการดิลิเวอรี่'}</h1>
    <p className="text-ink-soft">{scope==='personal'?'ข้อมูลนี้เฉพาะคุณ แม้ผู้ดูแลก็เปิดดูบัญชีส่วนตัวของสมาชิกคนอื่นไม่ได้':'สำหรับส่วนกลางบันทึกรายรับและรายจ่ายของโครงการ'} · หน่วยเงินบาท</p>
    <div className="flex flex-wrap gap-4 text-indigo"><Link href="/account/cashbook">บัญชีส่วนตัว</Link>{profile.role==='superadmin' && <><Link href="/finance/cashbook">บัญชีโครงการ</Link><Link href="/finance">การเงินตำบล</Link></>}</div>
    <Card><p>สมุดนี้บันทึกด้วยผู้ใช้ ยังไม่ดึงออเดอร์หรือรายการโอนมาลงอัตโนมัติ การบันทึกไม่ใช่การโอนเงินหรือยืนยันยอดธนาคาร</p></Card>
    <Card><div className="flex flex-wrap items-end gap-3"><Field label="เดือนรายงาน"><Input type="month" value={month} disabled={busy} onChange={e=>{if(e.target.value){setMonth(e.target.value);setPage(0);}}}/></Field><Button variant="ghost" disabled={loading||busy} onClick={()=>void load()}>โหลดข้อมูลล่าสุด</Button></div>
      {loading?<p role="status">กำลังอ่านบัญชี…</p>:report && <><div className="grid gap-3 sm:grid-cols-3"><div>รายรับ<strong className="block text-xl text-jade">{baht(report.income)}</strong></div><div>รายจ่าย<strong className="block text-xl text-clay">{baht(report.expense)}</strong></div><div>รายรับหักรายจ่าย<strong className="block text-xl">{baht(Number(report.income)-Number(report.expense))}</strong></div></div><p className="mt-3 text-sm text-ink-soft">สรุปทั้งเดือน ไม่รวมรายการยกเลิก · ไม่ใช่ยอดคงเหลือธนาคาร</p></>}
    </Card>
    {error && <p role="alert" className="text-clay">{error}</p>}{message && <p role="status" className="text-jade">{message}</p>}
    <Card><h2 className="mb-4 font-head text-xl">เพิ่มรายการ</h2><form onSubmit={save}><fieldset disabled={busy}>
      <div className="grid gap-x-4 sm:grid-cols-2"><Field label="วันที่"><Input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="ประเภทรายการ"><select className={selectClass} value={kind} onChange={e=>setKind(e.target.value as 'income'|'expense')}><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></Field>
      <Field label="จำนวนเงิน (บาท)"><Input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></Field><Field label="หมวดหมู่"><Input required maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} placeholder="เช่น ค่าส่ง ค่าอาหาร ค่าเดินทาง"/></Field></div>
      <Field label="หมายเหตุ"><Textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field><div className="flex gap-3"><Button type="submit">{busy?'กำลังบันทึก…':'บันทึกรายการ'}</Button><Button type="button" variant="ghost" onClick={()=>{requestId.current=null;setAmount('');setCategory('');setNote('');setError('');}}>เริ่มรายการใหม่</Button></div>
    </fieldset></form></Card>
    <Card><h2 className="font-head text-xl">รายการประจำเดือน</h2><p className="mb-4 text-sm text-ink-soft">ผิดพลาดให้ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่ ระบบเก็บประวัติเดิม</p>
      {!loading && report?.entries.length===0 && <p>ยังไม่มีรายการในเดือนนี้</p>}
      {!loading && report?.entries.map(row=><article key={row.id} className="border-t border-border py-4"><div className="flex flex-wrap justify-between gap-2"><strong>{row.entry_date} · {row.category}</strong><strong className={row.kind==='income'?'text-jade':'text-clay'}>{row.kind==='income'?'รายรับ':'รายจ่าย'} {baht(row.amount)}</strong></div>{row.note && <p className="my-2 whitespace-pre-wrap break-words">{row.note}</p>}
        {row.voided_at?<p className="text-sm text-clay">ยกเลิกแล้ว: {row.void_reason}</p>:<Button variant="ghost" disabled={busy} onClick={()=>{setVoidId(row.id);setReason('');}}>ยกเลิกรายการ</Button>}
        {voidId===row.id && <form onSubmit={cancel} className="mt-3"><Field label="เหตุผลที่ยกเลิก"><Input required maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></Field><div className="flex gap-3"><Button disabled={busy||!reason.trim()}>ยืนยันยกเลิก</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setVoidId(null)}>กลับ</Button></div></form>}
      </article>)}
      {report && <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="ghost" disabled={page===0||loading||busy} onClick={()=>setPage(p=>p-1)}>ก่อนหน้า</Button><span>หน้า {page+1} · {report.count} รายการรวมประวัติยกเลิก</span><Button variant="ghost" disabled={(page+1)*50>=report.count||loading||busy} onClick={()=>setPage(p=>p+1)}>ถัดไป</Button></div>}
    </Card>
  </div>;
}
