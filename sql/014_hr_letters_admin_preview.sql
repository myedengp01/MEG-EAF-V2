-- Applied to project vzngfswtofegimfcoigx on 2026-09-22. No issuance or record writes.
create or replace function public.hr_letters_admin_preview(p_code text,p_employee uuid,p_fields jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare t public.hr_letter_templates%rowtype; e public.employee_master%rowtype; v_text text; v_values jsonb; v_key text; v_value text; v_missing jsonb := '[]'::jsonb; v_match text[];
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or pg_column_size(p_fields)>32768 then raise exception 'Invalid preview fields' using errcode='22023'; end if;
 select * into t from public.hr_letter_templates where code=p_code;
 if not found or length(btrim(t.body))=0 then raise exception 'Template wording unavailable' using errcode='22023'; end if;
 select * into e from public.employee_master where id=p_employee;
 if not found then raise exception 'Employee not found' using errcode='22023'; end if;
 v_values:=p_fields || jsonb_build_object('employee_name',coalesce(e.employee_name,''),'employee_id',coalesce(e.employee_id,''),'company_name',coalesce(e.company_code,''),'department',coalesce(e.department,''),'position',coalesce(e.approved_job_title,''),'current_position',coalesce(e.approved_job_title,''),'current_department',coalesce(e.department,''),'current_basic',coalesce(e.final_salary::text,''));
 v_text:=t.body;
 for v_match in select regexp_matches(t.body,'\{\{([a-zA-Z0-9_]+)\}\}','g') loop
  v_key:=v_match[1]; v_value:=nullif(btrim(v_values->>v_key),'');
  if v_value is null then
   if not (v_missing ? v_key) then v_missing:=v_missing||to_jsonb(v_key); end if;
  else
   v_text:=replace(v_text,'{{'||v_key||'}}',v_value);
  end if;
 end loop;
 return jsonb_build_object('code',t.code,'title',t.title,'version',t.version,'employee_id',e.employee_id,'company_code',e.company_code,'preview',v_text,'missing_fields',v_missing,'issuance_enabled',false);
end $$;
revoke all on function public.hr_letters_admin_preview(text,uuid,jsonb) from public,anon;
grant execute on function public.hr_letters_admin_preview(text,uuid,jsonb) to authenticated;
