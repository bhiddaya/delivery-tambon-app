-- 20260905_notify_on_new_order.sql
--
-- ยิงแจ้งเตือนไรเดอร์ทันทีที่มีออเดอร์ใหม่ โดยไม่ผ่าน n8n
--
-- ทำไมไม่ใช้ n8n: n8n ที่ตั้งเวลา poll ทุก 1 นาที แปลว่าออเดอร์อาจนอนรอ
-- ถึง 60 วินาทีก่อนไรเดอร์รู้ตัว ซึ่งนานเกินไปสำหรับอาหาร และถ้า n8n ล่ม
-- ก็เงียบไปทั้งระบบ trigger ที่ฐานข้อมูลยิงเองใช้เวลาไม่ถึงวินาที
-- และมีชีวิตอยู่ตราบเท่าที่ฐานข้อมูลยังรับออเดอร์ได้
--
-- ข้อแลกเปลี่ยน: ต้องตั้ง Vault secrets สองตัว (notify_secret, notify_url)
-- ถ้ายังไม่ตั้ง trigger จะเงียบ ไม่ error — ดูเหตุผลด้านล่าง

-- pg_net สร้าง schema ของตัวเองชื่อ `net` เสมอ (ระบุ with schema ไม่ได้)
-- ด้านล่างจึงเรียกแบบเต็ม net.http_post ไม่พึ่ง search_path
create extension if not exists pg_net;

create or replace function public.notify_new_order()
returns trigger
language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_secret text;
  v_url text;
begin
  -- แจ้งเฉพาะงานที่เปิดรับจริง
  if new.status is distinct from 'pending' then
    return new;
  end if;

  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'notify_secret' limit 1;

    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'notify_url' limit 1;

    -- ยังไม่ได้ตั้งค่า ก็แค่ไม่แจ้งเตือน ไม่ใช่เรื่องที่ต้องล้มการสั่งงาน
    if v_secret is null or v_url is null then
      return new;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-notify-secret', v_secret),
      body    := jsonb_build_object('action', 'new_order', 'order_id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- บันทึกไว้ใน log ของฐานข้อมูลแล้วปล่อยผ่าน
    raise warning 'notify_new_order failed for order %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- หัวใจของไฟล์นี้: ทั้งก้อนอยู่ใน begin/exception ที่กลืน error ทุกชนิด
-- ถ้า LINE ล่ม, Edge Function พัง, หรือเน็ตหลุด ลูกค้าต้องยังสั่งของได้อยู่
-- การแจ้งเตือนล้มเหลวไม่ควรทำให้ร้านขายของไม่ได้
--
-- ทดสอบแล้ว: insert ออเดอร์ตอนที่ยังไม่ได้ตั้ง Vault เลย — insert ผ่านปกติ

drop trigger if exists orders_notify_new on public.orders;

create trigger orders_notify_new
  after insert on public.orders
  for each row
  execute function public.notify_new_order();
