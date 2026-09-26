-- Applied to Supabase vzngfswtofegimfcoigx on 2026-09-22. Draft and submission only; no approval or issuance.
create or replace function public.hr_letters_admin_save_draft(p_employee uuid,p_code text,p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path=public,auth as $$
declare v_employee public.employee_master%rowtype; v_template public.hr_letter_templates%rowtype; v_id uuid;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or pg_column_size(p_fields)>32768 then raise exception 'Invalid draft fields' using errcode='22023'; end if;
 select * into v_employee from public.employee_master where id=p_employee;
 if not found then raise exception 'Employee not found' using errcode='22023'; end if;
 select * into v_template from public.hr_letter_templates where code=p_code and length(btrim(body))>0;
 if not found then raise exception 'Template unavailable' using errcode='22023'; end if;
 insert into public.hr_letter_records(employee_id,company_code,template_code,template_version,status,fields,source_snapshot,created_by)
 values(v_employee.id,v_employee.company_code,v_template.code,v_template.version,'draft',p_fields,jsonb_build_object('employee_id',v_employee.employee_id,'employee_name',v_employee.employee_name,'company_code',v_employee.company_code,'department',v_employee.department,'position',v_employee.approved_job_title,'template_code',v_template.code,'template_version',v_template.version),auth.uid()) returning id into v_id;
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(v_id,auth.uid(),'draft_created',jsonb_build_object('template_code',v_template.code,'template_version',v_template.version,'company_code',v_employee.company_code));
 return v_id;
end $$;
revoke all on function public.hr_letters_admin_save_draft(uuid,text,jsonb) from public,anon;
grant execute on function public.hr_letters_admin_save_draft(uuid,text,jsonb) to authenticated;
create or replace function public.hr_letters_admin_list_drafts()
returns table(id uuid,employee_name text,employee_number text,company_code text,template_code text,template_version text,status text,created_at timestamptz,created_by uuid)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 return query select r.id,coalesce(r.source_snapshot->>'employee_name',''),coalesce(r.source_snapshot->>'employee_id',''),r.company_code,r.template_code,r.template_version,r.status,r.created_at,r.created_by from public.hr_letter_records r order by r.created_at desc limit 200;
end $$;
revoke all on function public.hr_letters_admin_list_drafts() from public,anon;
grant execute on function public.hr_letters_admin_list_drafts() to authenticated;
create or replace function public.hr_letters_admin_submit_draft(p_letter uuid)
returns text language plpgsql volatile security definer set search_path=public,auth as $$
declare v_record public.hr_letter_records%rowtype; v_preview jsonb;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select * into v_record from public.hr_letter_records where id=p_letter for update;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 if v_record.status<>'draft' then raise exception 'Only drafts may be submitted' using errcode='22023'; end if;
 if v_record.created_by<>auth.uid() then raise exception 'Only the draft creator may submit' using errcode='42501'; end if;
 if not exists(select 1 from public.hr_letter_templates t where t.code=v_record.template_code and t.version=v_record.template_version and length(btrim(t.body))>0) then raise exception 'Template version changed; create a new draft' using errcode='22023'; end if;
 v_preview:=public.hr_letters_admin_preview(v_record.template_code,v_record.employee_id,v_record.fields);
 if jsonb_array_length(v_preview->'missing_fields')>0 then raise exception 'Complete all required letter fields before submission' using errcode='22023'; end if;
 update public.hr_letter_records set status='pending_approval',updated_at=now(),source_snapshot=source_snapshot||jsonb_build_object('submitted_preview',v_preview->>'preview','submitted_at',now()) where id=p_letter;
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'submitted_for_approval',jsonb_build_object('template_version',v_record.template_version));
 return 'pending_approval';
end $$;
revoke all on function public.hr_letters_admin_submit_draft(uuid) from public,anon;
grant execute on function public.hr_letters_admin_submit_draft(uuid) to authenticated;
