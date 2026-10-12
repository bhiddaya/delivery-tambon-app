-- อาจารย์อนุมัติ 12 ต.ค. 2569 (ข้อ 2, 3): ทำใน LINE แทนหน้าเว็บ
-- * ไรเดอร์: ปุ่มออนไลน์ / ออฟไลน์ ในการ์ด งานไรเดอร์ (งานอาหารใน LINE ตรวจแค่ drivers.is_online)
-- * ร้านค้า: ปุ่ม ของหมด / มีของ → รายการสินค้า กดสลับ menu_items.is_available ได้ทีละรายการ
do $$
declare def text := pg_get_functiondef('public.line_partner_flow(text,text)'::regprocedure);
  old1 text := $o$  elsif a->>'action'='confirm_payout' then$o$;
  new1 text := $n$  elsif a->>'action' in ('stock','item_on','item_off') then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    select * into shop from public.merchants where profile_id=p.id limit 1;
    if a->>'action'<>'stock' then
      begin
        update public.menu_items set is_available=(a->>'action'='item_on') where id=(a->>'item_id')::uuid and merchant_id=shop.id;
      exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','bad_action'); end;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'available',m.is_available) order by m.name),'[]') into jobs
      from (select * from public.menu_items where merchant_id=shop.id and not is_hidden order by name limit 20) m;
    return jsonb_build_object('ok',true,'view','stock','title','ของหมด / มีของ','items',jobs);
  elsif a->>'action' in ('go_online','go_offline') then
    if p.role<>'driver' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    update public.drivers set is_online=(a->>'action'='go_online'), updated_at=now() where profile_id=p.id;
    if not found then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    return jsonb_build_object('ok',true,'view','partner_result','text',case when a->>'action'='go_online'
      then 'ออนไลน์แล้ว งานใหม่ในตำบลจะขึ้นใน งานไรเดอร์' else 'ออฟไลน์แล้ว ไม่รับงานใหม่ งานเดิมยังทำต่อได้' end);
  elsif a->>'action'='confirm_payout' then$n$;
  old2 text := $o$'role','driver','title','งานไรเดอร์ในตำบลของคุณ'$o$;
  new2 text := $n$'role','driver','online',(select d.is_online from public.drivers d where d.profile_id=p.id),'title','งานไรเดอร์ในตำบลของคุณ'$n$;
begin
  if position(old1 in def) = 0 then raise exception 'line_partner_flow: confirm_payout branch not found'; end if;
  if position(old2 in def) = 0 then raise exception 'line_partner_flow: driver view not found'; end if;
  execute replace(replace(def, old1, new1), old2, new2);
end $$;
