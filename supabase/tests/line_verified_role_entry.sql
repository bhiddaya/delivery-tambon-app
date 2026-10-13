-- Execute after the candidate migration within BEGIN / ROLLBACK.
do $$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
 line_id text:='U'||replace(gen_random_uuid()::text,'-',''); area uuid; other_area uuid; checks integer:=0;
begin
 select id into area from public.tambons order by created_at limit 1;
 select id into other_area from public.tambons where id<>area order by created_at limit 1;
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 values(uid,'line-entry-'||uid||'@qa.invalid','{}','{}'),(other_uid,'line-entry-'||other_uid||'@qa.invalid','{}','{}');
 insert into public.profiles(id,full_name,role,approved,is_test,line_user_id)
 values(uid,'QA LINE entry','customer',true,true,line_id);
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
 insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method)
 values(gen_random_uuid(),sid,now(),now(),'otp');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
 if public.backoffice_session_valid() then raise exception 'unverified OTP accepted'; end if; checks:=checks+1;
 update auth.users set raw_user_meta_data=jsonb_build_object('line_user_id',line_id,'provider','line','role','superadmin') where id=uid;
 if public.backoffice_session_valid() then raise exception 'editable metadata accepted'; end if; checks:=checks+1;
 update auth.users set raw_app_meta_data=jsonb_build_object('line_user_id',line_id) where id=uid;
 if not public.backoffice_session_valid() then raise exception 'verified LINE denied'; end if; checks:=checks+1;
 if public.agent_dashboard_access(area) then raise exception 'LINE elevated unappointed customer'; end if; checks:=checks+1;
 insert into public.admin_scopes(profile_id,tambon_id) values(uid,area);
 if not public.agent_dashboard_access(area) or public.agent_dashboard_access(other_area) then raise exception 'LINE area guard'; end if; checks:=checks+1;
 if jsonb_array_length(public.agent_dashboard_areas())<>1 then raise exception 'LINE scopes leaked'; end if; checks:=checks+1;
 begin perform public.agent_dashboard(other_area); raise exception 'LINE cross area read allowed'; exception when insufficient_privilege then null; end; checks:=checks+1;
 begin perform public.agent_work_save(other_area,gen_random_uuid(),'QA','','orders'); raise exception 'LINE cross area write allowed'; exception when insufficient_privilege then null; end; checks:=checks+1;
 update public.profiles set approved=false where id=uid;
 if public.agent_dashboard_access(area) then raise exception 'unapproved account accepted'; end if; checks:=checks+1;
 update public.profiles set approved=true,suspended_at=now() where id=uid;
 if public.agent_dashboard_access(area) then raise exception 'suspended account accepted'; end if; checks:=checks+1;
 update public.profiles set suspended_at=null,line_user_id='U'||repeat('0',32) where id=uid;
 if public.backoffice_session_valid() then raise exception 'mismatched LINE accepted'; end if; checks:=checks+1;
 update public.profiles set line_user_id=line_id where id=uid;
 update auth.sessions set not_after=now()-interval '1 minute' where id=sid;
 if public.backoffice_session_valid() then raise exception 'expired session accepted'; end if; checks:=checks+1;
 update auth.sessions set not_after=null where id=sid;
 update auth.users set banned_until=now()+interval '1 day' where id=uid;
 if public.backoffice_session_valid() then raise exception 'banned user accepted'; end if; checks:=checks+1;
 update auth.users set banned_until=null where id=uid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','session_id',sid)::text,true);
 if public.backoffice_session_valid() then raise exception 'another user session accepted'; end if; checks:=checks+1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id','invalid')::text,true);
 if public.backoffice_session_valid() then raise exception 'malformed session accepted'; end if; checks:=checks+1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 if public.backoffice_session_valid() then raise exception 'missing session accepted'; end if; checks:=checks+1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
 update auth.users set raw_app_meta_data='{}' where id=uid;
 update auth.mfa_amr_claims set authentication_method='password' where session_id=sid;
 if not public.backoffice_session_valid() or not public.agent_dashboard_access(area) then raise exception 'password regression'; end if; checks:=checks+1;
 execute 'set local role authenticated';
 if not public.backoffice_session_valid() then raise exception 'authenticated RPC grant missing'; end if; checks:=checks+1;
 execute 'reset role';
 delete from auth.sessions where id=sid;
 if public.backoffice_session_valid() or public.agent_dashboard_access(area) then raise exception 'revoked session accepted'; end if; checks:=checks+1;
 if has_function_privilege('anon','public.backoffice_session_valid()','EXECUTE') then raise exception 'public execute granted'; end if; checks:=checks+1;
 if checks<>20 then raise exception 'unexpected check count: %',checks; end if;
 perform set_config('line_entry.checks',checks::text,true);
end;
$$;
select current_setting('line_entry.checks')::integer as passed_checks;
