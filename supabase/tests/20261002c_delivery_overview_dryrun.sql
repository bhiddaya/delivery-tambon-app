-- Dry run for 20261002c_delivery_overview.sql. Run in ONE transaction right after the migration
-- text; it always ends with an error on purpose, so everything rolls back.
do $t$
declare j jsonb; t jsonb; st text; out text := '';
begin
  j := public.delivery_overview();
  out := out || 'tambons: ' || jsonb_array_length(j->'tambons') || ' (expect = count(tambons))' || E'\n';
  out := out || 'db_size>0: ' || ((j->>'db_size_bytes')::bigint > 0) || E'\n';
  out := out || 'superadmins: ' || (j->>'superadmins') || E'\n';
  for t in select * from jsonb_array_elements(j->'tambons') loop
    out := out || (t->>'name') || ': customers ' || (t->'customers'->>'total') || '/' || (t->'customers'->>'with_line')
        || ' · merchants ' || (t->'merchants'->>'total') || ' line ' || (t->'merchants'->>'with_line')
        || ' gps ' || (t->'merchants'->>'with_gps') || ' menu ' || (t->'merchants'->>'with_menu')
        || ' · drivers ' || (t->'drivers'->>'total') || ' approved ' || (t->'drivers'->>'approved')
        || ' line ' || (t->'drivers'->>'with_line') || ' · admins ' || (t->'admins'->>'total')
        || ' · web apps pending ' || (t->>'web_applications_pending') || ' · orders_7d ' || (t->>'orders_7d') || E'\n';
  end loop;
  out := out || 'pending tambon applications: ' || jsonb_array_length(j->'tambon_applications_pending') || E'\n';
  out := out || 'contains phone/line id/promptpay/lat keys: '
      || (j::text ~ '"(phone|applicant_phone|line_user_id|promptpay_id|lat|lng|address)"') || ' (expect false)' || E'\n';
  out := out || 'test merchants leaked: ' || exists (
      select 1 from public.merchants m, jsonb_array_elements(j->'tambons') tt, jsonb_array_elements(tt->'merchants'->'list') ml
       where m.is_test and ml->>'name' = m.name) || ' (expect false)' || E'\n';
  out := out || 'anon execute: ' || has_function_privilege('anon','public.delivery_overview()','execute')
      || ', authenticated execute: ' || has_function_privilege('authenticated','public.delivery_overview()','execute')
      || ', service_role execute: ' || has_function_privilege('service_role','public.delivery_overview()','execute')
      || ' (expect false, false, true)' || E'\n';
  perform set_config('role','authenticated',true);
  begin perform public.delivery_overview(); st := 'ok'; exception when others then st := sqlstate; end;
  out := out || 'authenticated call: ' || st || ' (expect 42501)' || E'\n';
  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;
