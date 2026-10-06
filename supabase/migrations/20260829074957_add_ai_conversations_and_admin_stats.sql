
-- Conversation memory for the admin AI assistant (per LINE user, currently used for admin only)
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (line_user_id, created_at);
alter table public.ai_conversations enable row level security;
comment on table public.ai_conversations is 'Rolling chat history for the AI assistant, keyed by LINE user id. Used to give the admin assistant conversation memory across messages.';

-- Live system stats snapshot for the admin AI assistant to ground its answers in real data
create or replace function public.admin_stats_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders_total', (select count(*) from public.orders),
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select status, count(*) cnt from public.orders group by status) s),
    'orders_by_type', (select coalesce(jsonb_object_agg(type, cnt), '{}'::jsonb) from (select type, count(*) cnt from public.orders group by type) t),
    'merchants_total', (select count(*) from public.merchants),
    'merchants_pending_approval', (select count(*) from public.profiles where role = 'merchant' and approved = false),
    'drivers_total', (select count(*) from public.drivers),
    'drivers_pending_approval', (select count(*) from public.profiles where role = 'driver' and approved = false),
    'drivers_online_now', (select count(*) from public.drivers where is_online = true),
    'job_seekers_total', (select count(*) from public.job_seekers),
    'profiles_by_role', (select coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb) from (select role, count(*) cnt from public.profiles group by role) p),
    'places_total', (select count(*) from public.places),
    'recent_orders', (
      select coalesce(jsonb_agg(o), '[]'::jsonb) from (
        select id, type, status, price, created_at from public.orders order by created_at desc limit 5
      ) o
    )
  );
$$;
comment on function public.admin_stats_snapshot() is 'Returns a live snapshot of key system counts/status for the admin AI assistant to ground answers in real data. Called via PostgREST RPC from n8n.';
