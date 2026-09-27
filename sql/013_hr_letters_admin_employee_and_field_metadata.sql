-- Applied to Supabase project vzngfswtofegimfcoigx on 2026-09-22.
-- Read-only admin-only metadata endpoints; no issuance or employee writes.
create or replace function public.hr_letters_admin_employees()
returns table(id uuid, employee_id text, employee_name text, company_code text, department text, job_title text)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 return query select e.id,e.employee_id,e.employee_name,e.company_code,e.department,e.approved_job_title from public.employee_master e order by e.employee_name,e.employee_id limit 2000;
end $$;
revoke all on function public.hr_letters_admin_employees() from public,anon;
grant execute on function public.hr_letters_admin_employees() to authenticated;
create or replace function public.hr_letters_admin_template_fields(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_body text; v_version text; v_title text; v_fields jsonb;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select t.body,t.version,t.title into v_body,v_version,v_title from public.hr_letter_templates t where t.code=p_code;
 if not found then raise exception 'Unknown letter template' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.field order by x.field),'[]'::jsonb) into v_fields from (select distinct m[1] as field from regexp_matches(v_body,'\{\{([a-zA-Z0-9_]+)\}\}','g') m) x;
 return jsonb_build_object('code',p_code,'title',v_title,'version',v_version,'fields',v_fields,'issuance_enabled',false);
end $$;
revoke all on function public.hr_letters_admin_template_fields(text) from public,anon;
grant execute on function public.hr_letters_admin_template_fields(text) to authenticated;
