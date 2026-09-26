-- Pending migration. NOT applied to production. Salary semantics remain unverified.
-- Requires employee_master, jd_entities and existing HR Letters/gateway RPCs.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
create schema if not exists hr_letters_private;
revoke all on schema hr_letters_private from public,anon,authenticated;
create or replace function hr_letters_private.company_name(p_code text)
returns text language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select case when count(*)=1 and bool_and(j.is_active) and min(btrim(j.name))<>'' then min(btrim(j.name)) end into result
 from public.jd_entities j where upper(btrim(j.code))=upper(btrim(p_code));
 return result;
end $$;
revoke all on function hr_letters_private.company_name(text) from public,anon,authenticated;

-- Add company_name to the existing directory; restore its authenticated-only ACL.
drop function public.hr_letters_admin_employees();
create function public.hr_letters_admin_employees()
returns table(id uuid,employee_id text,employee_name text,company_code text,department text,"position" text,company_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 return query select e.id,e.employee_id,e.employee_name,e.company_code,e.department,e.approved_job_title,hr_letters_private.company_name(e.company_code)
 from public.employee_master e order by e.employee_name,e.employee_id limit 2000;
end $$;
revoke all on function public.hr_letters_admin_employees() from public,anon;
grant execute on function public.hr_letters_admin_employees() to authenticated;

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
 if p_code='LOC_LOI' and upper(btrim(e.company_code))<>'MEG' then raise exception 'Combined confirmation/increment wording is restricted to MEG pending entity-specific review' using errcode='22023'; end if;
 v_values:=p_fields || jsonb_build_object('employee_name',coalesce(e.employee_name,''),'employee_id',coalesce(e.employee_id,''),'company_name',v_company_name,'department',coalesce(e.department,''),'position',coalesce(e.approved_job_title,''),'current_position',coalesce(e.approved_job_title,''),'current_department',coalesce(e.department,''),'current_basic',coalesce(e.final_salary::text,''));
 v_text:=t.body;
 for v_match in select regexp_matches(t.body,'\{\{([a-zA-Z0-9_]+)\}\}','g') loop
  v_key:=v_match[1]; v_value:=nullif(btrim(v_values->>v_key),'');
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

commit;
