begin;
set local lock_timeout='2s';
alter table public.hr_letter_templates drop constraint hr_letter_templates_code_check;
alter table public.hr_letter_templates add constraint hr_letter_templates_code_check check(code ~ '^(RL|LOP|LOC_LOI|EL|DI|SAL|UAL|TRL|TL|PIP|WL|PEL|SCL|LOI|LOC)(_TP[2-9][0-9]*|_TP1[0-9]+)?$');
create table public.hr_letter_uploads (
 code text primary key references public.hr_letter_templates(code),
 base_code text not null references public.hr_letter_templates(code),
 storage_path text not null unique, file_name text not null,
 format text not null check(format in ('docx','pdf')),
 company_code text not null check(company_code in ('MEG','HD','ABP','MEH')),
 reusable boolean not null default false,
 publication text not null default 'private' check(publication in ('private','pending','published','rejected')),
 created_by uuid not null, created_at timestamptz not null default now(),
 reviewed_by uuid, reviewed_at timestamptz
);
create table public.hr_letter_template_audit (
 id uuid primary key default gen_random_uuid(), code text not null references public.hr_letter_uploads(code),
 actor_id uuid not null, action text not null, details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.hr_letter_uploads enable row level security;
alter table public.hr_letter_template_audit enable row level security;
revoke all on public.hr_letter_uploads,public.hr_letter_template_audit from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-letter-sources','hr-letter-sources',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy hr_letter_source_insert on storage.objects for insert to authenticated with check (
 bucket_id='hr-letter-sources' and public.eaf_v2_is_admin(auth.uid()) and split_part(name,'/',1)=auth.uid()::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx)$'
);
create policy hr_letter_source_read on storage.objects for select to authenticated using(bucket_id='hr-letter-sources' and public.eaf_v2_is_admin(auth.uid()));
create policy hr_letter_source_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'hr-letter-sources') with check(bucket_id<>'hr-letter-sources');
create policy hr_letter_source_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'hr-letter-sources');

create function hr_letters_private.check_upload(p_code text,p_employee uuid) returns void
language plpgsql stable security definer set search_path=public,auth as $$
declare u public.hr_letter_uploads%rowtype; v_company text;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into u from public.hr_letter_uploads where code=p_code;
 if not found then return; end if;
 if u.created_by<>auth.uid() and u.publication<>'published' and not exists(select 1 from public.eaf_v2_staff_permissions where user_id=auth.uid() and is_super_admin) then raise exception 'Uploaded template is not published' using errcode='42501'; end if;
 select upper(btrim(company_code)) into v_company from public.employee_master where id=p_employee;
 if u.company_code is distinct from v_company then raise exception 'Uploaded template must match employee company' using errcode='22023'; end if;
end $$;
revoke all on function hr_letters_private.check_upload(text,uuid) from public,anon,authenticated;

create function public.hr_letters_register_template(p_base text,p_path text,p_name text,p_format text,p_company text,p_body text,p_reusable boolean default false)
returns text language plpgsql security definer set search_path=public,auth as $$
declare b public.hr_letter_templates%rowtype; n integer; c text; meta jsonb; expected text;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into b from public.hr_letter_templates where code=p_base and code not like '%\_TP%' escape '\' for update;
 if not found then raise exception 'Select an original letter type' using errcode='22023'; end if;
 if p_format is null or p_format not in ('docx','pdf') or p_company is null or p_company not in ('MEG','HD','ABP','MEH') or hr_letters_private.company_name(p_company) is null or p_body is null or length(btrim(p_body))=0 or octet_length(p_body)>100000 or p_name is null or length(p_name)>200 or p_reusable is null then raise exception 'Invalid uploaded template' using errcode='22023'; end if;
 if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text or p_path !~ ('^[0-9a-f-]{36}/[0-9a-f-]{36}\.'||p_format||'$') then raise exception 'Invalid upload path' using errcode='22023'; end if;
 expected:=case p_format when 'pdf' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end;
 select metadata into meta from storage.objects where bucket_id='hr-letter-sources' and name=p_path and owner_id=auth.uid()::text;
 if not found or meta->>'mimetype' is distinct from expected or coalesce((meta->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'Upload ownership or metadata mismatch' using errcode='42501'; end if;
 select coalesce(max(substring(code from '_TP([0-9]+)$')::integer),1)+1 into n from public.hr_letter_uploads where base_code=p_base;
 c:=p_base||'_TP'||n;
 insert into public.hr_letter_templates(code,title,version,body,active) values(c,b.title,gen_random_uuid()::text,case when p_format='pdf' then 'Uploaded PDF: '||c||'. Review the attached document.' else p_body end,false);
 insert into public.hr_letter_uploads(code,base_code,storage_path,file_name,format,company_code,reusable,publication,created_by) values(c,p_base,p_path,p_name,p_format,p_company,p_reusable,case when p_reusable then 'pending' else 'private' end,auth.uid());
 insert into public.hr_letter_template_audit(code,actor_id,action,details) values(c,auth.uid(),'uploaded',jsonb_build_object('path',p_path,'company_code',p_company,'reusable',p_reusable));
 return c;
end $$;
revoke all on function public.hr_letters_register_template(text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.hr_letters_register_template(text,text,text,text,text,text,boolean) to authenticated;

create function public.hr_letters_uploaded_templates() returns setof public.hr_letter_uploads
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if;
 return query select u.* from public.hr_letter_uploads u where u.publication='published' or u.created_by=auth.uid() or exists(select 1 from public.eaf_v2_staff_permissions where user_id=auth.uid() and is_super_admin) order by u.created_at;
end $$;
revoke all on function public.hr_letters_uploaded_templates() from public,anon;
grant execute on function public.hr_letters_uploaded_templates() to authenticated;

create function public.hr_letters_publish_template(p_code text,p_approve boolean) returns text
language plpgsql security definer set search_path=public,auth as $$
declare u public.hr_letter_uploads%rowtype; s text;
begin
 if auth.uid() is null or not exists(select 1 from public.eaf_v2_staff_permissions where user_id=auth.uid() and is_super_admin) then raise exception 'Super administrator required' using errcode='42501'; end if;
 select * into u from public.hr_letter_uploads where code=p_code for update;
 if not found or u.publication<>'pending' or p_approve is null then raise exception 'Template not awaiting publication' using errcode='22023'; end if;
 if u.created_by=auth.uid() then raise exception 'Uploader cannot publish own template' using errcode='42501'; end if;
 s:=case when p_approve then 'published' else 'rejected' end;
 update public.hr_letter_uploads set publication=s,reviewed_by=auth.uid(),reviewed_at=now() where code=p_code;
 insert into public.hr_letter_template_audit(code,actor_id,action) values(p_code,auth.uid(),s);
 return s;
end $$;
revoke all on function public.hr_letters_publish_template(text,boolean) from public,anon;
grant execute on function public.hr_letters_publish_template(text,boolean) to authenticated;

create function hr_letters_private.protect_uploaded_template() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.hr_letter_uploads where code=old.code) then raise exception 'Uploaded template versions are immutable; upload a new alternative' using errcode='42501'; end if;
 return new;
end $$;
create trigger hr_uploaded_template_immutable before update or delete on public.hr_letter_templates for each row execute function hr_letters_private.protect_uploaded_template();

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
 perform hr_letters_private.check_upload(p_code,p_employee);
 v_company_name:=hr_letters_private.company_name(e.company_code);
 if v_company_name is null then raise exception 'Company name is missing, inactive or ambiguous in the entity register' using errcode='22023'; end if;
 v_values:=p_fields || jsonb_build_object('employee_name',coalesce(e.employee_name,''),'employee_id',coalesce(e.employee_id,''),'company_name',v_company_name,'department',coalesce(e.department,''),'position',coalesce(e.approved_job_title,''),'current_position',coalesce(e.approved_job_title,''),'current_department',coalesce(e.department,''),'current_basic',coalesce(e.final_salary::text,''));
 if nullif(p_fields->>'letterhead_code','') is not null and upper(btrim(p_fields->>'letterhead_code'))<>upper(btrim(e.company_code)) then raise exception 'Letterhead must match employee company' using errcode='22023'; end if;
 if exists(select 1 from public.hr_letter_uploads where code=p_code) and coalesce(p_fields->>'letterhead_mode','company') not in ('company','included') then raise exception 'Invalid letterhead option' using errcode='22023'; end if;
 v_text:=t.body;
 for v_match in select regexp_matches(t.body,'\{\{([a-zA-Z0-9_]+)\}\}','g') loop
  v_key:=v_match[1]; v_value:=nullif(btrim(v_values->>v_key),'');
  if v_key in ('current_basic','basic_increment','basic_increment_pct','revised_basic') and replace(v_value,',','') ~ '^-?[0-9]+([.][0-9]+)?$' then v_value:=round(replace(v_value,',','')::numeric,2)::text; end if;
  v_values:=jsonb_set(v_values,array[v_key],coalesce(to_jsonb(v_value),'""'::jsonb));
  if v_value is null then
   if not (v_missing ? v_key) then v_missing:=v_missing||to_jsonb(v_key); end if;
  else
   v_text:=replace(v_text,'{{'||v_key||'}}',v_value);
  end if;
 end loop;
 return jsonb_build_object('code',t.code,'title',t.title,'version',t.version,'employee_id',e.employee_id,'company_code',e.company_code,'company_name',v_company_name,'preview',v_text,'missing_fields',v_missing,'issuance_enabled',false,'document',(select to_jsonb(u)||jsonb_build_object('values',v_values,'text',v_text,'letterhead_mode',coalesce(p_fields->>'letterhead_mode','company'),'letterhead_code',e.company_code) from public.hr_letter_uploads u where u.code=p_code));
end $$;
revoke all on function public.hr_letters_admin_preview(text,uuid,jsonb) from public,anon;
grant execute on function public.hr_letters_admin_preview(text,uuid,jsonb) to authenticated;


-- Applied to Supabase vzngfswtofegimfcoigx on 2026-09-22. Draft and submission only; no approval or issuance.
create or replace function public.hr_letters_admin_save_draft(p_employee uuid,p_code text,p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path=public,auth as $$
declare v_employee public.employee_master%rowtype; v_template public.hr_letter_templates%rowtype; v_id uuid;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or pg_column_size(p_fields)>32768 then raise exception 'Invalid draft fields' using errcode='22023'; end if;
 perform public.hr_letters_admin_preview(p_code,p_employee,p_fields);
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
 update public.hr_letter_records set status='pending_approval',updated_at=now(),source_snapshot=source_snapshot||jsonb_build_object('submitted_preview',v_preview->>'preview','submitted_at',now(),'document',v_preview->'document') where id=p_letter;
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'submitted_for_approval',jsonb_build_object('template_version',v_record.template_version));
 return 'pending_approval';
end $$;
revoke all on function public.hr_letters_admin_submit_draft(uuid) from public,anon;
grant execute on function public.hr_letters_admin_submit_draft(uuid) to authenticated;

-- Reproducible migration for issuance objects verified in Supabase on 2026-09-22.
-- Issuance does not deliver letters or notify employees.
create or replace function public.hr_letters_admin_issue(p_letter uuid)
returns text language plpgsql security definer set search_path=public,auth as $$
declare r public.hr_letter_records%rowtype; v_super boolean; v_preview text; v_snapshot jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(is_super_admin,false) into v_super from public.eaf_v2_staff_permissions where user_id=auth.uid();
 if not coalesce(v_super,false) then raise exception 'Super administrator issuance required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter for update;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 if r.status<>'approved' or r.approved_at is null or r.approved_by is null then raise exception 'Only approved letters may be issued' using errcode='22023'; end if;
 if r.created_by=auth.uid() then raise exception 'Creator cannot issue own letter' using errcode='42501'; end if;
 if r.issued_snapshot is not null then raise exception 'Issued snapshot already exists' using errcode='22023'; end if;
 v_preview:=nullif(r.source_snapshot->>'approved_preview','');
 if v_preview is null or v_preview<>r.source_snapshot->>'submitted_preview' then raise exception 'Frozen approved preview missing or inconsistent' using errcode='22023'; end if;
 v_snapshot:=jsonb_build_object('letter_id',r.id,'employee_id',r.employee_id,'company_code',r.company_code,'template_code',r.template_code,'template_version',r.template_version,'letter_text',v_preview,'document',r.source_snapshot->'document','approved_by',r.approved_by,'approved_at',r.approved_at,'issued_by',auth.uid(),'issued_at',now());
 update public.hr_letter_records set status='issued',issued_snapshot=v_snapshot,issued_by=auth.uid(),issued_at=now(),updated_at=now() where id=p_letter;
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'issued',v_snapshot);
 return 'issued';
end $$;
revoke all on function public.hr_letters_admin_issue(uuid) from public,anon;
grant execute on function public.hr_letters_admin_issue(uuid) to authenticated;

create or replace function public.hr_letters_admin_view(p_letter uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare r public.hr_letter_records%rowtype;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 return jsonb_build_object('id',r.id,'status',r.status,'employee_id',r.employee_id,'company_code',r.company_code,'template_code',r.template_code,'template_version',r.template_version,'text',case when r.status='issued' then r.issued_snapshot->>'letter_text' when r.status='approved' then r.source_snapshot->>'approved_preview' when r.status='pending_approval' then r.source_snapshot->>'submitted_preview' else null end,'approved_at',r.approved_at,'issued_at',r.issued_at,'document',case when r.status='issued' then r.issued_snapshot->'document' else r.source_snapshot->'document' end);
end $$;
revoke all on function public.hr_letters_admin_view(uuid) from public,anon;
grant execute on function public.hr_letters_admin_view(uuid) to authenticated;


create or replace function public.hr_letters_admin_templates()
returns table(code text,title text,version text,active boolean,has_body boolean)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then
   raise exception 'HR Letters administrator access required' using errcode='42501';
 end if;
 return query select t.code,t.title,t.version,t.active,(length(btrim(t.body))>0)
 from public.hr_letter_templates t where not exists(select 1 from public.hr_letter_uploads u where u.code=t.code) or t.code in(select u.code from public.hr_letters_uploaded_templates() u) order by t.code;
end $$;
revoke all on function public.hr_letters_admin_templates() from public,anon;
grant execute on function public.hr_letters_admin_templates() to authenticated;

commit;
