begin;
set local lock_timeout='2s';
create or replace function public.hr_letters_admin_preview(p_code text,p_employee uuid,p_fields jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare t public.hr_letter_templates%rowtype; e public.employee_master%rowtype; v_company_name text; v_text text; v_values jsonb; v_key text; v_value text; v_missing jsonb := '[]'::jsonb; v_match text[];
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or pg_column_size(p_fields)>32768 then raise exception 'Invalid preview fields' using errcode='22023'; end if;
 select * into t from public.hr_letter_templates where code=p_code;
 if not found or length(btrim(t.body))=0 then raise exception 'Template wording unavailable' using errcode='22023'; end if;
 select * into e from public.employee_master where id=p_employee;
 if not found then raise exception 'Employee not found' using errcode='22023'; end if;
 v_company_name:=hr_letters_private.company_name(e.company_code);
 if v_company_name is null then raise exception 'Company name is missing, inactive or ambiguous in the entity register' using errcode='22023'; end if;
 v_values:=p_fields || jsonb_build_object('employee_name',coalesce(e.employee_name,''),'employee_id',coalesce(e.employee_id,''),'company_name',v_company_name,'department',coalesce(e.department,''),'position',coalesce(e.approved_job_title,''),'current_position',coalesce(e.approved_job_title,''),'current_department',coalesce(e.department,''),'current_basic',coalesce(e.final_salary::text,''));
 if nullif(p_fields->>'letterhead_code','') is not null and upper(btrim(p_fields->>'letterhead_code'))<>upper(btrim(e.company_code)) then raise exception 'Letterhead must match employee company' using errcode='22023'; end if;
 v_text:=t.body;
 for v_match in select regexp_matches(t.body,'\{\{([a-zA-Z0-9_]+)\}\}','g') loop
  v_key:=v_match[1]; v_value:=nullif(btrim(v_values->>v_key),'');
  if v_key in ('current_basic','basic_increment','basic_increment_pct','revised_basic') and replace(v_value,',','') ~ '^-?[0-9]+([.][0-9]+)?$' then v_value:=round(replace(v_value,',','')::numeric,2)::text; end if;
  if v_value is null then
   if not (v_missing ? v_key) then v_missing:=v_missing||to_jsonb(v_key); end if;
  else
   v_text:=replace(v_text,'{{'||v_key||'}}',v_value);
  end if;
 end loop;
 return jsonb_build_object('code',t.code,'title',t.title,'version',t.version,'employee_id',e.employee_id,'company_code',e.company_code,'company_name',v_company_name,'preview',v_text,'missing_fields',v_missing,'issuance_enabled',false);
end $$;
revoke all on function public.hr_letters_admin_preview(text,uuid,jsonb) from public,anon;
grant execute on function public.hr_letters_admin_preview(text,uuid,jsonb) to authenticated;

do $guard$ begin
 if exists(select 1 from public.hr_letter_templates where code='LOI' and position($old$Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}$old$ in replace(body,E'\r\n',E'\n'))=0 and position($new$Description | Current | Increment | Increment (%) | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}$new$ in replace(body,E'\r\n',E'\n'))=0) then raise exception 'LOI salary table drift'; end if;
end $guard$;
update public.hr_letter_templates set body=replace(replace(body,E'\r\n',E'\n'),$old$Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}$old$,$new$Description | Current | Increment | Increment (%) | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}$new$),version='v2026.09.27-increment-percentage',updated_at=now() where code='LOI' and position($old$Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}$old$ in replace(body,E'\r\n',E'\n'))>0;
commit;
