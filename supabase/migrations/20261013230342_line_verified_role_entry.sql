-- Owner approved 14 Oct 2026: verified LINE may access the existing role.
-- Authentication only: roles, scopes, approval checks and RLS are unchanged.
create or replace function public.backoffice_session_valid()
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare session_text text:=auth.jwt()->>'session_id'; session_uuid uuid;
begin
 if auth.uid() is null or coalesce(session_text,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 session_uuid:=session_text::uuid;
 return exists (
   select 1 from auth.sessions s join auth.users u on u.id=s.user_id
   where s.id=session_uuid and s.user_id=auth.uid()
     and (s.not_after is null or s.not_after>now())
     and (u.banned_until is null or u.banned_until<=now())
     and exists (
      select 1 from auth.mfa_amr_claims c where c.session_id=s.id and (
       c.authentication_method='password'
       or (c.authentication_method='otp' and exists (
        select 1 from public.profiles p where p.id=u.id
          and p.line_user_id ~ '^U[0-9a-fA-F]{32}$'
          and u.raw_app_meta_data->>'line_user_id'=p.line_user_id
       ))
      )
     )
  );
end;
$$;
comment on function public.backoffice_session_valid() is
 'Active own session: password or LINE OTP with service-controlled app_metadata matching the profile. Never trust user_metadata or a supplied LINE ID.';
revoke all on function public.backoffice_session_valid() from public, anon;
grant execute on function public.backoffice_session_valid() to authenticated;

create or replace function public.agent_dashboard_access(p_tambon_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null
   and coalesce(public.can_admin_tambon(p_tambon_id),false)
   and exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.suspended_at is null)
   and public.backoffice_session_valid() is true;
$$;
