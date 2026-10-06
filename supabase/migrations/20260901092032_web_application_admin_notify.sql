
create extension if not exists pg_net;

create or replace function public.notify_web_application_insert()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'web_application_notify_secret';
  if v_secret is null or v_secret = '' then
    raise exception 'Missing Vault secret: web_application_notify_secret';
  end if;
  perform net.http_post(
    url := 'https://pittaya1.app.n8n.cloud/webhook/web-application-new',
    body := jsonb_build_object('secret', v_secret, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_web_application_insert on public.web_applications;
create trigger trg_notify_web_application_insert
after insert on public.web_applications
for each row execute function public.notify_web_application_insert();
