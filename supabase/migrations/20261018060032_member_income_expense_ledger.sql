create table public.cashbook_entries (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('personal','delivery')),
 owner_id uuid not null references public.profiles(id),
 entry_date date not null,
 kind text not null check(kind in ('income','expense')),
 amount numeric(12,2) not null check(amount > 0 and amount < 10000000000),
 category text not null check(length(btrim(category)) between 1 and 80),
 note text not null default '' check(length(note)<=1000),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references public.profiles(id),
 voided_at timestamptz,
 voided_by uuid references public.profiles(id),
 void_reason text,
 unique(created_by,request_id)
);
alter table public.cashbook_entries enable row level security;
create index cashbook_scope_owner_date on public.cashbook_entries(scope,owner_id,entry_date);
create function public.cashbook_can_access(p_scope text,p_owner uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=auth.uid() and suspended_at is null
 and ((p_scope='personal' and p_owner=auth.uid()) or (p_scope='delivery' and role='superadmin' and public.backoffice_session_valid())));
$$;
revoke all on function public.cashbook_can_access(text,uuid) from public,anon;
grant execute on function public.cashbook_can_access(text,uuid) to authenticated;
create policy cashbook_read on public.cashbook_entries for select to authenticated using(public.cashbook_can_access(scope,owner_id));
create policy cashbook_insert on public.cashbook_entries for insert to authenticated with check(
 public.cashbook_can_access(scope,owner_id) and owner_id=auth.uid() and created_by=auth.uid()
 and voided_at is null and voided_by is null and void_reason is null);
create policy cashbook_void on public.cashbook_entries for update to authenticated
 using(public.cashbook_can_access(scope,owner_id)) with check(public.cashbook_can_access(scope,owner_id));
revoke all on public.cashbook_entries from public,anon,authenticated;
grant select on public.cashbook_entries to authenticated;
grant insert(scope,owner_id,entry_date,kind,amount,category,note,request_id) on public.cashbook_entries to authenticated;
grant update(voided_at,void_reason) on public.cashbook_entries to authenticated;
create function public.cashbook_void_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.voided_at is not null or new.voided_at is null or length(btrim(coalesce(new.void_reason,''))) not between 1 and 500 then
 raise exception 'ยกเลิกได้ครั้งเดียวและต้องระบุเหตุผล' using errcode='22023'; end if;
 new.voided_at:=now(); new.voided_by:=auth.uid(); return new;
end $$;
revoke all on function public.cashbook_void_guard() from public,anon,authenticated;
create trigger cashbook_guard before update on public.cashbook_entries for each row execute function public.cashbook_void_guard();
create function public.cashbook_record(p_scope text,p_date date,p_kind text,p_amount numeric,p_category text,p_note text,p_request uuid)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if p_amount is null or p_amount<>round(p_amount,2) then raise exception 'จำนวนเงินต้องมีไม่เกินสองตำแหน่งทศนิยม' using errcode='22023'; end if;
 select id into v_id from public.cashbook_entries where created_by=auth.uid() and request_id=p_request;
 if v_id is not null then
 if not exists(select 1 from public.cashbook_entries where id=v_id and scope=p_scope and entry_date=p_date and kind=p_kind and amount=p_amount and category=btrim(p_category) and note=coalesce(p_note,'')) then raise exception 'รหัสคำขอเดิมมีข้อมูลต่างกัน' using errcode='22023'; end if;
 return v_id; end if;
 insert into public.cashbook_entries(scope,owner_id,entry_date,kind,amount,category,note,request_id)
 values(p_scope,auth.uid(),p_date,p_kind,p_amount,btrim(p_category),coalesce(p_note,''),p_request) returning id into v_id;
 return v_id;
end $$;
create function public.cashbook_void(p_id uuid,p_reason text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.cashbook_entries set voided_at=now(),void_reason=btrim(p_reason) where id=p_id and voided_at is null;
 return found;
end $$;
create function public.cashbook_month(p_scope text,p_month date,p_page integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_start date:=date_trunc('month',p_month)::date; v_result jsonb;
begin
 if p_scope not in ('personal','delivery') or p_scope is null or p_month is null or p_page<0 or p_page>100000 then raise exception 'ช่วงรายงานไม่ถูกต้อง' using errcode='22023'; end if;
 if not public.cashbook_can_access(p_scope,auth.uid()) then raise exception 'ไม่มีสิทธิ์เปิดสมุดบัญชีนี้' using errcode='42501'; end if;
 with entries as materialized (
 select * from public.cashbook_entries where scope=p_scope and entry_date>=v_start and entry_date<(v_start+interval '1 month')
 ), totals as (
 select count(*) as count,coalesce(sum(amount) filter(where kind='income' and voided_at is null),0) as income,
 coalesce(sum(amount) filter(where kind='expense' and voided_at is null),0) as expense from entries
 ), page as (select * from entries order by entry_date desc,created_at desc,id desc limit 50 offset p_page*50)
 select jsonb_build_object('count',totals.count,'income',totals.income,'expense',totals.expense,'entries',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into v_result from totals;
 return v_result;
end $$;
revoke all on function public.cashbook_record(text,date,text,numeric,text,text,uuid),public.cashbook_void(uuid,text),public.cashbook_month(text,date,integer) from public,anon;
grant execute on function public.cashbook_record(text,date,text,numeric,text,text,uuid),public.cashbook_void(uuid,text),public.cashbook_month(text,date,integer) to authenticated;
notify pgrst,'reload schema';

