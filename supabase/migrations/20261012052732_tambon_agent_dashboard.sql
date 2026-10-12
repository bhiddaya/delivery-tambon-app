-- D55: operations only. These work records never change orders or payments.
create table public.agent_work_items (
  id uuid primary key,
  tambon_id uuid not null references public.tambons(id),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  detail text not null default '' check (char_length(detail)<=2000),
  category text not null check (category in ('orders','shops','drivers','finance','members','coordination')),
  status text not null default 'todo' check (status in ('todo','doing','waiting','done')),
  due_on date,
  order_id bigint references public.orders(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_work_items_area on public.agent_work_items(tambon_id,status,updated_at desc);
create table public.agent_work_events (
  id uuid primary key,
  task_id uuid not null references public.agent_work_items(id),
  tambon_id uuid not null references public.tambons(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check(action in ('create','start','wait','done','reopen','note')),
  status text not null check(status in ('todo','doing','waiting','done')),
  note text not null default '' check(char_length(note)<=2000),
  created_at timestamptz not null default now()
);
create index agent_work_events_area on public.agent_work_events(tambon_id,created_at desc);
alter table public.agent_work_items enable row level security;
alter table public.agent_work_events enable row level security;
revoke all on public.agent_work_items,public.agent_work_events from anon,authenticated;
grant select on public.agent_work_items,public.agent_work_events to authenticated;

-- Definer is necessary for the existing area-scoped private orders/profiles and
-- append-only journals. Every exposed RPC calls this guard before reading data.
create function public.agent_dashboard_access(p_tambon_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
   and coalesce(public.can_admin_tambon(p_tambon_id),false)
   and exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.suspended_at is null)
   and public.session_used_password() is true;
$$;
revoke all on function public.agent_dashboard_access(uuid) from public,anon;
grant execute on function public.agent_dashboard_access(uuid) to authenticated;
create policy agent_work_items_read on public.agent_work_items for select to authenticated
 using (public.agent_dashboard_access(tambon_id));
create policy agent_work_events_read on public.agent_work_events for select to authenticated
 using (public.agent_dashboard_access(tambon_id));

create function public.agent_dashboard_areas() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug) order by t.name),'[]'::jsonb)
 from public.tambons t where public.agent_dashboard_access(t.id);
$$;

create function public.agent_work_save(p_tambon_id uuid,p_request_id uuid,p_title text,p_detail text,p_category text,p_due_on date default null,p_order_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.agent_work_items;
begin
 if not public.agent_dashboard_access(p_tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' using errcode='42501'; end if;
 if p_order_id is not null and not exists(select 1 from public.orders where id=p_order_id and tambon_id=p_tambon_id and not is_test) then
   raise exception 'ออเดอร์ไม่อยู่ในพื้นที่' using errcode='22023';
 end if;
 insert into public.agent_work_items(id,tambon_id,title,detail,category,due_on,order_id,created_by,updated_by)
 values(p_request_id,p_tambon_id,btrim(p_title),btrim(p_detail),p_category,p_due_on,p_order_id,auth.uid(),auth.uid())
 on conflict(id) do nothing returning * into v;
 if v.id is null then
   select * into v from public.agent_work_items where id=p_request_id;
   if v.tambon_id<>p_tambon_id or v.created_by<>auth.uid() or v.title<>btrim(p_title) or v.detail<>btrim(p_detail) or v.category<>p_category
     or v.due_on is distinct from p_due_on or v.order_id is distinct from p_order_id then
     raise exception 'รายการซ้ำแต่รายละเอียดต่างกัน กรุณาตรวจใหม่' using errcode='22023';
   end if;
   return to_jsonb(v);
 end if;
 insert into public.agent_work_events(id,task_id,tambon_id,actor_id,action,status,note)
 values(p_request_id,v.id,v.tambon_id,auth.uid(),'create',v.status,v.detail);
 return to_jsonb(v);
end;
$$;

create function public.agent_work_update(p_task_id uuid,p_request_id uuid,p_version integer,p_action text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.agent_work_items; e public.agent_work_events; next_status text;
begin
 select * into v from public.agent_work_items where id=p_task_id for update;
 if v.id is null or not public.agent_dashboard_access(v.tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์' using errcode='42501'; end if;
 select * into e from public.agent_work_events where id=p_request_id;
 if e.id is not null then
   if e.task_id is distinct from v.id or e.actor_id is distinct from auth.uid() or e.action is distinct from p_action or e.note is distinct from btrim(p_note) then raise exception 'คำขอซ้ำไม่ตรงรายการเดิม' using errcode='22023'; end if;
   return to_jsonb(v);
 end if;
 if v.version is distinct from p_version then raise exception 'มีผู้แก้รายการนี้แล้ว กรุณาอัปเดตข้อมูลก่อน' using errcode='40001'; end if;
 if char_length(p_note)>2000 then raise exception 'บันทึกยาวเกินกำหนด' using errcode='22023'; end if;
 if p_action='wait' and char_length(btrim(p_note))<5 then raise exception 'กรุณาระบุสิ่งที่รอ' using errcode='22023'; end if;
 if p_action='note' and char_length(btrim(p_note))<3 then raise exception 'กรุณาเขียนความคืบหน้า' using errcode='22023'; end if;
 next_status:=case p_action when 'start' then 'doing' when 'wait' then 'waiting' when 'done' then 'done' when 'reopen' then 'todo' when 'note' then v.status else null end;
 if next_status is null then raise exception 'ไม่พบปุ่มจัดการนี้' using errcode='22023'; end if;
 update public.agent_work_items set status=next_status,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v.id returning * into v;
 insert into public.agent_work_events(id,task_id,tambon_id,actor_id,action,status,note)
 values(p_request_id,v.id,v.tambon_id,auth.uid(),p_action,v.status,btrim(p_note));
 return to_jsonb(v);
end;
$$;

create function public.agent_dashboard(p_tambon_id uuid,p_status text default 'open',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
begin
 if not public.agent_dashboard_access(p_tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' using errcode='42501'; end if;
 if p_status not in ('open','todo','doing','waiting','done') or p_status is null or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'ตัวกรองไม่ถูกต้อง' using errcode='22023'; end if;
 select jsonb_build_object(
   'area',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'intake_blocked',t.intake_blocked),
   'counts',jsonb_build_object(
     'today_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and created_at>=day_start),
     'active_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and status in ('pending','accepted','in_progress')),
     'delivered_today',(select count(*) from public.orders where tambon_id=t.id and not is_test and status='delivered' and delivered_at>=day_start),
     'awaiting_payment',(select count(*) from public.orders where tambon_id=t.id and not is_test and status not in ('delivered','cancelled') and payment_method<>'เงินสดปลายทาง' and customer_paid_at is null),
     'pending_payouts',(select count(*) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'payout_amount',(select coalesce(sum(amount),0) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'shops',(select count(*) from public.merchants where tambon_id=t.id and not is_test),
     'open_shops',(select count(*) from public.merchants m where m.tambon_id=t.id and not m.is_test and public.shop_is_open(m.id)),
     'online_drivers',(select count(*) from public.profiles p join public.drivers d on d.profile_id=p.id where p.tambon_id=t.id and not p.is_test and p.approved and p.suspended_at is null and d.is_online),
     'pending_members',(select count(*) from public.profiles p where p.tambon_id=t.id and not p.is_test and not p.approved and p.role in ('driver','merchant')),
     'open_messages',(select count(*) from public.messages m where not m.is_test and (m.to_tambon_id=t.id or m.from_tambon_id=t.id) and m.status not in ('closed','resolved'))),
   'tasks',coalesce((select jsonb_agg(to_jsonb(w) order by w.updated_at desc) from (select * from public.agent_work_items where tambon_id=t.id and (case when p_status='open' then status<>'done' else status=p_status end) order by updated_at desc,id limit 100 offset p_offset) w),'[]'::jsonb),
   'task_counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'waiting',count(*) filter(where status='waiting'),'done',count(*) filter(where status='done')) from public.agent_work_items where tambon_id=t.id),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select id,task_id,action,status,note,created_at from public.agent_work_events where tambon_id=t.id order by created_at desc limit 50) e),'[]'::jsonb),
   'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from (select id,type,status,customer_paid_at is not null as paid,payment_method<>'เงินสดปลายทาง' as needs_payment,merchant_accepted_at is not null as shop_accepted,food_ready_at is not null as food_ready,driver_id is not null as driver_assigned,created_at from public.orders where tambon_id=t.id and not is_test and status in ('pending','accepted','in_progress') order by created_at limit 20) o),'[]'::jsonb)
 ) into result from public.tambons t where t.id=p_tambon_id;
 return result;
end;
$$;

-- Only generated operational counts leave Delivery. No free text, personal
-- data, actor IDs, address, receipt, bank account or financial amount is mirrored.
create function public.agent_memory_snapshot(p_tambon_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; s jsonb;
begin
 d:=public.agent_dashboard(p_tambon_id);
 s:=jsonb_build_object('tambon_id',p_tambon_id,'day',to_char(now() at time zone 'Asia/Bangkok','YYYY-MM-DD'),
 'counts',(d->'counts')-'payout_amount','task_counts',d->'task_counts',
 'last_work_change',(select max(updated_at) from public.agent_work_items where tambon_id=p_tambon_id));
 return jsonb_build_object('revision',md5(s::text),'summary',s);
end;
$$;
revoke all on function public.agent_dashboard_areas(),public.agent_work_save(uuid,uuid,text,text,text,date,bigint),public.agent_work_update(uuid,uuid,integer,text,text),public.agent_dashboard(uuid,text,integer),public.agent_memory_snapshot(uuid) from public,anon;
grant execute on function public.agent_dashboard_areas(),public.agent_work_save(uuid,uuid,text,text,text,date,bigint),public.agent_work_update(uuid,uuid,integer,text,text),public.agent_dashboard(uuid,text,integer),public.agent_memory_snapshot(uuid) to authenticated;
alter publication supabase_realtime add table public.agent_work_items,public.agent_work_events;
do $$ declare t text; begin
 foreach t in array array['settlements','profiles','admin_scopes','tambons'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
     execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
 end loop;
end; $$;
