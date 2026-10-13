# 60 — LLP: LINE OA + LINE Mini App + PWA (ร่างสถาปัตยกรรม)

ร่าง 13 ต.ค. 2569 · สถานะ: **ออกแบบ ยังไม่ติดตั้งอะไร** · ระบบเดิม **LP** (LINE OA + PWA + ตรวจสลิปมือ) ต้องทำงานต่อได้ตลอด

## เจ้าของตัดสินใจแล้ว (13 ต.ค. 2569)

- Payment Gateway: **Opn Payments (Omise)** — PromptPay charge + webhook `charge.complete` · โอนออกใช้ Recipients + Transfers API
- บัญชีรับเงินส่วนกลาง **บัญชีเดียว**: บัญชีล่าสุดของคุณใจสุข → จะเปิดเป็นนิติบุคคล **วิสาหกิจชุมชนบวรไทย** (ช่วงทดสอบใช้ test key ได้ก่อน live ต้องผ่าน KYC ของ Opn ในนามผู้รับเงินจริง)
- LINE Mini App: เริ่ม **unverified** เพื่อทดสอบ แล้วค่อยยื่นเอกสาร verified → ช่วงนี้ไม่มี Service Message ใช้ push ผ่าน OA แทน

## ขั้นที่ 1 ในโค้ด (branch claude/llp-design — ยังไม่ deploy/apply)

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/liff-base.tsx` | context `/liff` หรือ `/llp` (ไม่มี provider = `/liff` → LP เหมือนเดิม) |
| `src/app/llp/*` | ใช้หน้า LIFF ชุดเดิม (re-export) ใต้ `/llp` |
| `src/components/LlpPayCard.tsx` | แสดง QR จาก Opn แทนการส่งสลิป เมื่ออยู่ใต้ `/llp` |
| `LiffProvider` | ใต้ `/llp` init ด้วย `NEXT_PUBLIC_LLP_LIFF_ID` |
| `supabase/functions/llp-create-payment` | สร้าง charge (secret `OPN_SECRET_KEY`) ยอดจากฐาน คืน QR เดิมถ้ามี pending |
| `supabase/functions/line-login` | รับ token ของช่อง Mini App ได้ (secret `LLP_LOGIN_CHANNEL_ID`) |
| `supabase/migrations/20261013c_llp_payments.sql` | `llp_payments`, `llp_payment_events`, RPC `llp_payment_succeeded` (เรียก `payment_verify_core` เดิม) |

ทดสอบ RPC แบบ rollback บนฐานจริงแล้ว: unknown_charge · event ซ้ำ · ยอดไม่ตรง · ออเดอร์ถูกยกเลิก (needs_refund) · จ่ายซ้ำ — ยังไม่ได้ทดสอบเส้นจ่ายสำเร็จจริง (รอ test key)

## 0. กติกาแยกระบบ (ห้ามเขียนทับ LP)

| สิ่งที่มี | LP (เดิม — ไม่แตะ) | LLP (ใหม่ — เพิ่มข้าง ๆ) |
|---|---|---|
| หน้า LIFF | `/liff/*` · `NEXT_PUBLIC_LIFF_ID` | `/llp/*` · `NEXT_PUBLIC_LLP_LIFF_ID` (ช่อง LINE Mini App ใหม่) |
| การจ่ายเงิน | QR พร้อมเพย์ตำบล + สลิป + ตัวแทนกดยืนยัน | Payment Gateway ยืนยันเอง (webhook) |
| n8n | workflow เดิมทั้งหมด (l2E6…, Csc8…, djVS…) | workflow ใหม่ชื่อขึ้นต้น `LLP —` |
| ฐานข้อมูล | ตาราง/ฟังก์ชันเดิม | ตารางใหม่ `llp_*` + RPC `llp_*` · ไม่ alter ของเดิม |
| การโอนออก | ตัวแทนสแกน QR โอนเอง (settlements) | Batch payout ผ่าน gateway ใช้ settlements แถวเดิม |

จุดเชื่อมเดียว: เมื่อ LLP ยืนยันเงินแล้ว จะ set `orders.customer_paid_at` / `payment_ref` / `payment_method='llp_gateway'`
ให้ขั้นต่อไป (ร้านรับออเดอร์ → อาหารพร้อม → ไรเดอร์) ใช้ flow เดิมของ LP ได้ทันที — ไม่ต้องเขียนงานร้าน/ไรเดอร์ใหม่

ย้อนกลับ: ปิดช่อง Mini App / ลบ route `/llp` / ปิด workflow `LLP —` → LP ยังทำงานเหมือนเดิม

## 1. ต้องตัดสินใจก่อนเขียนโค้ด (เจ้าของ)

1. **Payment Gateway ตัวไหน** — ต้องมี (ก) PromptPay QR แบบ dynamic + webhook ยืนยันอัตโนมัติ (ข) API โอนออกหลายผู้รับ (recipient/transfer หรือ bulk payout)
   ตัวเลือกที่ควรเทียบ: Opn Payments (Omise), GB Prime Pay, 2C2P, Beam, หรือ API ธนาคาร (KBank/SCB) · ต้องขอเอกสาร ค่าธรรมเนียม และเงื่อนไข KYC จากผู้ให้บริการโดยตรง
2. **เงินเข้าบัญชีใคร** — gateway ปกติรับเงินเข้าบัญชีบริษัทเดียว (ส่วนกลาง) ไม่ใช่บัญชีตำบล
   → โมเดล "โอนผ่านตำบล + เงินประกันตัวแทน" เปลี่ยน: ส่วนกลางรับเงิน แล้วโอนให้ร้าน/ไรเดอร์/ส่วนแบ่งตัวแทน (`agent_share_*_pct`)
3. **ข้อกฎหมาย** — การรับเงินแทนร้านค้าแล้วโอนต่อ (marketplace) อาจเข้าข่ายธุรกิจบริการชำระเงินตามกฎ ธปท. ควรถาม gateway ว่ารองรับ marketplace/sub-merchant หรือไม่ และปรึกษาผู้รู้ก่อนเปิดจริง
4. **LINE Mini App** — สร้างช่องใหม่ใน LINE Developers (ไม่ใช้ LIFF เดิม) · ต้องผ่านการตรวจของ LINE ก่อนเผยแพร่ · Service Message ใช้ได้เฉพาะ Mini App ที่ verified และเฉพาะข้อความตามเทมเพลตที่อนุมัติ

## 2. ขั้นตอนผู้ใช้ (15 → 4)

**ลูกค้า:** ① แตะเมนูริชใน OA → เปิด Mini App (ล็อกอินอัตโนมัติ, ครั้งแรกกรอกชื่อ/เบอร์/จุดส่งในหน้าเดียว) ② ติ๊กเมนู ③ สรุปยอด+ค่าส่ง กดยืนยัน ④ จ่าย PromptPay (ระบบยืนยันเอง ไม่ต้องส่งสลิป)
**ร้านค้า:** ① ได้แจ้งเตือน "จ่ายแล้ว" ② รับออเดอร์ ③ อาหารพร้อม ④ (วันละครั้ง) เงินเข้าบัญชีอัตโนมัติ
**ไรเดอร์:** เหมือน LP (รับงาน → รับอาหาร → ส่งถึง) + ค่าส่งเข้าบัญชีอัตโนมัติ
**ตัวแทนตำบล:** ไม่ต้องตรวจสลิป/โอนเอง → ใช้ PWA ดูภาพรวม แก้ปัญหา คืนเงิน อนุมัติสมาชิก

## 3. Frontend: แนะนำ Next.js ใน repo เดิม (ไม่แยก Vue/HTML)

เหตุผล: มี LIFF SDK (`@line/liff`), `LiffProvider`, `use-line-session`, `line-login` Edge Function, `customer_food_review/confirm`, `FoodMenuRow` ใช้งานจริงแล้ว
แยก repo ใหม่ = เขียนซ้ำทั้งหมดและ deploy สองที่ · ใช้ route ใหม่ใน repo เดิม = ใช้ของเดิมได้ แต่ไม่แตะหน้า `/liff`

```
src/app/llp/
  layout.tsx            LlpLiffProvider (liffId = NEXT_PUBLIC_LLP_LIFF_ID) + เปลือกหน้า Mini App
  page.tsx              เลือกร้าน (ใช้ LiffFoodBrowser ซ้ำ ส่ง basePath="/llp")
  shop/[id]/page.tsx    เมนู+ตะกร้า (ใช้ FoodMenuRow ซ้ำ)
  checkout/page.tsx     สรุป → llp_create_payment → แสดง QR → รอสถานะ (Supabase Realtime บน llp_payments)
  order/[id]/page.tsx   ติดตามสถานะออเดอร์
src/lib/llp/
  payment.ts            เรียก RPC/Edge Function สร้างการชำระเงิน (ไม่มี secret ฝั่ง client)
supabase/functions/llp-create-payment/   Edge Function: ตรวจ quote token → เรียก gateway สร้าง charge → บันทึก llp_payments
```

หลักการ: ยอดเงินคำนวณฝั่ง DB เท่านั้น (quote token เดิม) · client ไม่ส่งราคา · secret key ของ gateway อยู่ใน Edge Function/n8n เท่านั้น

## 4. Supabase schema (ร่าง — ยังไม่สร้าง)

```sql
create table public.llp_payments (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders(id),
  provider text not null,                 -- 'opn' | 'gbprime' | ...
  provider_charge_id text unique,         -- id ฝั่ง gateway
  amount numeric(12,2) not null,
  status text not null default 'pending'  -- pending | paid | failed | expired | refunded
    check (status in ('pending','paid','failed','expired','refunded')),
  qr_payload text, expires_at timestamptz,
  paid_at timestamptz, created_at timestamptz not null default now()
);
create table public.llp_payment_events (  -- กัน webhook ซ้ำ (idempotent)
  provider text not null, event_id text not null, payload jsonb not null,
  received_at timestamptz not null default now(), primary key (provider, event_id)
);
create table public.llp_payout_batches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique, status text not null default 'draft', -- draft | sent | partial | done
  total numeric(12,2), created_at timestamptz not null default now()
);
create table public.llp_payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.llp_payout_batches(id),
  settlement_id bigint not null unique references public.settlements(id),
  provider_transfer_id text, status text not null default 'pending', error text
);
-- RLS: ลูกค้าอ่าน llp_payments ของออเดอร์ตัวเอง · admin/superadmin อ่านทั้งตำบล · เขียนได้เฉพาะ service_role
```

RPC `llp_payment_succeeded(p_provider, p_event_id, p_charge_id, p_amount, p_payload)` — security definer, เรียกได้เฉพาะ service_role:
1. insert `llp_payment_events` (ซ้ำ → คืน `duplicate`)
2. lock แถว `llp_payments` ตาม charge id · ตรวจ `amount` ตรงกับที่บันทึกไว้ · ถ้า paid แล้ว → `duplicate`
3. set `status='paid'` และ `orders.customer_paid_at=now(), payment_ref=charge_id, payment_method='llp_gateway'`
4. คืน `{ newly_paid, order_id, merchant_line_user_id, customer_line_user_id }` ให้ n8n ส่งข้อความ

## 5. n8n: workflow ใหม่ "LLP — Payment Webhook"

```
[Webhook POST /llp/payment/<provider>]
  → [Code: ตรวจลายเซ็น/secret ของ webhook]          ไม่ผ่าน → ตอบ 401 จบ
  → [HTTP: ดึง charge จาก gateway API ด้วย id]       อย่าเชื่อ payload อย่างเดียว ยืนยันสถานะกับต้นทางเสมอ
  → [IF status = successful]
  → [Supabase RPC: llp_payment_succeeded]            idempotent
  → [IF newly_paid]
      ├─ [LINE push → ร้าน: การ์ดออเดอร์ + ปุ่ม รับออเดอร์ (postback เดิมของ LP)]
      └─ [LINE Service Message → ลูกค้า: "ชำระเงินสำเร็จ #id"]   (ถ้ายังไม่ verified ใช้ push แทน)
  → [Respond 200]                                    ตอบ 200 ทุกกรณีที่ประมวลผลแล้ว รวม duplicate กัน gateway ส่งซ้ำ
```
- ตั้ง Error Workflow แจ้งส่วนกลางเมื่อ RPC/LINE ล้มเหลว · ไม่ log secret/เลขบัญชีลง execution
- ออเดอร์ที่ไม่จ่ายใน 15 นาที: ใช้ตัวยกเลิกอัตโนมัติเดิม + set `llp_payments.status='expired'`

## 6. Batch payout วันละครั้ง (หลังตัดรอบ 21:00)

1. n8n Schedule 21:05 → RPC `llp_build_payout_batch(run_date)`: รวม `settlements` ที่ `paid_out_at is null` และออเดอร์ `delivered` ของ LLP ต่อผู้รับ → สร้าง batch + items (สถานะ `draft`)
2. **ส่วนกลางตรวจใน PWA แล้วกดอนุมัติ** (เงินออกจริง ต้องมีคนกด) → n8n เรียก transfer API ทีละผู้รับ ใช้ `settlement_id` เป็น idempotency key
3. webhook ผลโอน → set `settlements.paid_out_at`, `payout_ref` · ล้มเหลว → `llp_payout_items.error` แสดงใน PWA ให้แก้บัญชีแล้วลองใหม่
4. ส่วนแบ่ง: ร้าน = ค่าอาหาร − ค่าคอมมิชชัน · ไรเดอร์ = ค่าส่ง − ส่วนแบ่งตัวแทน · ตัวแทน = ตาม `agent_share_commission_pct` / `agent_share_delivery_pct` · ค่าธรรมเนียม gateway ใครรับ = ต้องตัดสินใจ
5. ผู้รับต้องมีบัญชีปลายทางที่ยืนยันกับ gateway แล้ว (recipient) — ใช้ข้อมูลจาก `promptpay_id` / QR ที่มีอยู่ไม่ได้โดยตรง ต้องลงทะเบียนใหม่

## 7. ลำดับงานที่เสนอ

1. เจ้าของเลือก gateway + เปิดบัญชีทดสอบ (sandbox) + สร้างช่อง LINE Mini App
2. สร้างตาราง `llp_*` + RPC บนฐาน (ไม่แตะของเดิม) · ทดสอบ rollback
3. หน้า `/llp` ใช้ component เดิม + Edge Function สร้าง charge (sandbox)
4. n8n "LLP — Payment Webhook" กับ sandbox · ทดสอบจ่ายซ้ำ/webhook ซ้ำ/ยอดไม่ตรง
5. ตำบลนำร่อง 1 ตำบล เปิด LLP คู่กับ LP · LP ยังเป็นทางสำรอง
6. Batch payout (sandbox → จริง) หลังการรับเงินเสถียรแล้ว
