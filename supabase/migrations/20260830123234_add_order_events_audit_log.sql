
create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  status order_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on order_events(order_id);

create or replace function log_order_status_change() returns trigger as $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into order_events(order_id, status, note)
    values (new.id, new.status, case when tg_op = 'INSERT' then 'order created' else null end);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_log_order_status_change on orders;
create trigger trg_log_order_status_change
after insert or update of status on orders
for each row execute function log_order_status_change();

-- backfill: give existing orders a starting event so the log has continuity
insert into order_events (order_id, status, note)
select id, status, 'backfilled on 2026-08-30 (order_events introduced after these orders existed)'
from orders
where not exists (select 1 from order_events e where e.order_id = orders.id);
