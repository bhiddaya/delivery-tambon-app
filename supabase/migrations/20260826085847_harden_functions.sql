
alter function public.set_updated_at() set search_path = public;
alter function public.set_default_approval() set search_path = public;
revoke execute on function public.is_admin() from anon;
