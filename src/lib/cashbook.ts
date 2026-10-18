export type CashbookScope = 'personal' | 'delivery';
export interface CashbookEntry {
  id: string; entry_date: string; kind: 'income'|'expense'; amount: number;
  category: string; note: string; created_at: string; voided_at: string|null; void_reason: string|null;
}
export interface CashbookReport { count: number; income: number; expense: number; entries: CashbookEntry[] }
export function thaiToday() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
export function baht(value: number) { return Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})+' บาท'; }
export function validAmount(value: string) { return /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value)>0 && Number(value)<10000000000; }
