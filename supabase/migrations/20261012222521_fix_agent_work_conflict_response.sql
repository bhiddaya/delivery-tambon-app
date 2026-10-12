-- D55: application version conflicts are HTTP 409, not transient serialization failures.
-- PostgREST retries SQLSTATE 40001. PT409 returns immediately without retrying.
-- Keep all existing scope, session, idempotency, row locking and permission checks.
CREATE OR REPLACE FUNCTION public.agent_work_update(p_task_id uuid, p_request_id uuid, p_version integer, p_action text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.agent_work_items; e public.agent_work_events; next_status text;
begin
 select * into v from public.agent_work_items where id=p_task_id for update;
 if v.id is null or not public.agent_dashboard_access(v.tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์' using errcode='42501'; end if;
 select * into e from public.agent_work_events where id=p_request_id;
 if e.id is not null then
   if e.task_id is distinct from v.id or e.actor_id is distinct from auth.uid() or e.action is distinct from p_action or e.note is distinct from btrim(p_note) then raise exception 'คำขอซ้ำไม่ตรงรายการเดิม' using errcode='22023'; end if;
   return to_jsonb(v);
 end if;
 if v.version is distinct from p_version then raise exception 'มีผู้แก้รายการนี้แล้ว กรุณาอัปเดตข้อมูลก่อน' using errcode='PT409'; end if;
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
$function$
;
