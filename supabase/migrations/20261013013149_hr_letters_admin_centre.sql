begin;
set local lock_timeout='3s';
create table public.hr_letter_placeholders (
 key text primary key check(key ~ '^[a-z][a-z0-9_]{0,79}$'), label text not null,
 description text not null default '', kind text not null default 'text' check(kind in ('text','paragraph','date','money','percentage','number')),
 source text not null default 'manual' check(source in ('manual','default','employee','calculation')),
 source_key text not null default '', default_value text not null default '', required boolean not null default true,
 editable boolean not null default true, active boolean not null default true, protected boolean not null default false,
 revision uuid not null default gen_random_uuid(), updated_at timestamptz not null default now(), updated_by uuid
);
create table public.hr_letter_admin_audit(id uuid primary key default gen_random_uuid(),actor_id uuid,action text not null,object_key text not null,before_value jsonb,after_value jsonb,reason text not null,created_at timestamptz not null default now());
create table public.hr_letter_template_versions(id uuid primary key default gen_random_uuid(),code text not null references public.hr_letter_templates(code),version text not null,title text not null,body text not null,actor_id uuid,reason text not null,created_at timestamptz not null default now(),unique(code,version));
alter table public.hr_letter_placeholders enable row level security;
alter table public.hr_letter_admin_audit enable row level security;
alter table public.hr_letter_template_versions enable row level security;
revoke all on public.hr_letter_placeholders,public.hr_letter_admin_audit,public.hr_letter_template_versions from public,anon,authenticated;
insert into public.hr_letter_placeholders(key,label)
select distinct m[1],initcap(replace(m[1],'_',' ')) from public.hr_letter_templates cross join lateral regexp_matches(body,'\{\{([a-zA-Z0-9_]+)\}\}','g') m;
update public.hr_letter_placeholders set source='employee',source_key=key,editable=false,protected=true where key in ('employee_name','employee_id','company_name','department','position','current_position','current_department','current_basic');
update public.hr_letter_placeholders set kind='money' where key in ('current_basic','basic_increment','revised_basic');
update public.hr_letter_placeholders set kind='percentage' where key='basic_increment_pct';
update public.hr_letter_placeholders set source='calculation',source_key=key where key in ('basic_increment_pct','revised_basic');
insert into public.hr_letter_template_versions(code,version,title,body,reason) select code,version,title,body,'Initial version before Admin Centre' from public.hr_letter_templates;

create function hr_letters_private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if; end $$;
revoke all on function hr_letters_private.require_admin() from public,anon,authenticated;

create function public.hr_letters_placeholder_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform hr_letters_private.require_admin();
return (select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('templates',(select coalesce(jsonb_agg(t.code order by t.code),'[]'::jsonb) from public.hr_letter_templates t where position('{{'||p.key||'}}' in t.body)>0)) order by p.key),'[]'::jsonb) from public.hr_letter_placeholders p);
end $$;

create function public.hr_letters_placeholder_save(p_item jsonb,p_expected uuid default null,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare old public.hr_letter_placeholders%rowtype; k text:=p_item->>'key'; v uuid; s text:=p_item->>'source'; sk text:=coalesce(p_item->>'source_key','');
begin perform hr_letters_private.require_admin();
if p_item is null or jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>16000 or k is null or k !~ '^[a-z][a-z0-9_]{0,79}$' or nullif(btrim(p_item->>'label'),'') is null or length(p_item->>'label')>120 or length(coalesce(p_item->>'description',''))>1000 or length(coalesce(p_item->>'default_value',''))>4000 or nullif(btrim(p_reason),'') is null then raise exception 'Enter a valid key, label and change reason'; end if;
if s='employee' and sk not in ('employee_name','employee_id','company_name','department','position','current_position','current_department','current_basic') then raise exception 'Choose an approved employee data source'; end if;
if s='calculation' and sk not in ('basic_increment_pct','revised_basic') then raise exception 'Choose an approved salary calculation'; end if;
select * into old from public.hr_letter_placeholders where key=k for update;
if found then
 if old.revision is distinct from p_expected then raise exception 'Placeholder changed elsewhere. Reload before saving.' using errcode='40001'; end if;
 if old.protected and (s<>old.source or sk<>old.source_key or coalesce((p_item->>'editable')::boolean,false) or not coalesce((p_item->>'active')::boolean,true)) then raise exception 'Employee Master source cannot be changed or archived'; end if;
else if p_expected is not null then raise exception 'Placeholder no longer exists'; end if; end if;
if not coalesce((p_item->>'active')::boolean,true) and exists(select 1 from public.hr_letter_templates where position('{{'||k||'}}' in body)>0) then raise exception 'This placeholder is used by a template. Remove its uses before archiving.'; end if;
insert into public.hr_letter_placeholders(key,label,description,kind,source,source_key,default_value,required,editable,active,updated_by)
values(k,btrim(p_item->>'label'),coalesce(p_item->>'description',''),p_item->>'kind',s,sk,coalesce(p_item->>'default_value',''),coalesce((p_item->>'required')::boolean,true),case when s='employee' then false when s='manual' then true else coalesce((p_item->>'editable')::boolean,true) end,coalesce((p_item->>'active')::boolean,true),auth.uid())
on conflict(key) do update set label=excluded.label,description=excluded.description,kind=excluded.kind,source=excluded.source,source_key=excluded.source_key,default_value=excluded.default_value,required=excluded.required,editable=excluded.editable,active=excluded.active,updated_by=auth.uid(),updated_at=now(),revision=gen_random_uuid() returning revision into v;
insert into public.hr_letter_admin_audit(actor_id,action,object_key,before_value,after_value,reason) values(auth.uid(),'placeholder_saved',k,to_jsonb(old),(select to_jsonb(p) from public.hr_letter_placeholders p where key=k),left(p_reason,2000)); return v;
end $$;

create function hr_letters_private.validate_body(p_body text) returns void language plpgsql stable security definer set search_path='' as $$
declare k text; token text; stack text[]:='{}'; clean text;
begin
if p_body is null or length(btrim(p_body))=0 or octet_length(p_body)>100000 then raise exception 'Letter wording must contain 1–100,000 bytes'; end if;
if p_body like '%{{{%' or p_body like '%}}}%' then raise exception 'Use [b]bold[/b] formatting and double-brace data placeholders'; end if;
clean:=regexp_replace(p_body,'\{\{[a-zA-Z0-9_]+\}\}','','g');
if clean like '%{{%' or clean like '%}}%' then raise exception 'Use complete double-brace placeholders, for example {{employee_name}}'; end if;
for k in select m[1] from regexp_matches(p_body,'\{\{([a-zA-Z0-9_]+)\}\}','g') m loop
if not exists(select 1 from public.hr_letter_placeholders where key=k and active) then raise exception 'Unknown or archived placeholder: %. Add it in Admin Centre first.',k; end if;
end loop;
for token in select m[1] from regexp_matches(p_body,'(\[/?[biu]\])','g') m loop
if substr(token,2,1)<>'/' then stack:=array_append(stack,substr(token,2,1));
else if coalesce(array_length(stack,1),0)=0 or stack[array_length(stack,1)]<>substr(token,3,1) then raise exception 'Formatting tags must be paired and correctly nested'; end if; stack:=stack[1:array_length(stack,1)-1]; end if;
end loop;
if coalesce(array_length(stack,1),0)>0 then raise exception 'Close each formatting tag'; end if;
end $$;
revoke all on function hr_letters_private.validate_body(text) from public,anon,authenticated;

create function hr_letters_private.resolve_fields(p_values jsonb,p_body text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.hr_letter_placeholders%rowtype; v text; result jsonb:=p_values; c numeric; i numeric;
begin perform hr_letters_private.require_admin();
for p in select * from public.hr_letter_placeholders where active order by key loop
 v:=nullif(btrim(p_values->>p.key),'');
 if p.source='employee' then v:=p_values->>p.source_key;
 elsif p.source='default' and (v is null or not p.editable) then v:=p.default_value;
 elsif p.source='calculation' and (v is null or not p.editable) then
  if replace(p_values->>'current_basic',',','') ~ '^-?[0-9]+([.][0-9]+)?$' and replace(p_values->>'basic_increment',',','') ~ '^-?[0-9]+([.][0-9]+)?$' then
   c:=replace(p_values->>'current_basic',',','')::numeric; i:=replace(p_values->>'basic_increment',',','')::numeric;
   v:=case p.source_key when 'revised_basic' then round(c+i,2)::text when 'basic_increment_pct' then case when c>0 then round(i/c*100,2)::text else null end end;
  else v:=null; end if;
 end if;
 if nullif(btrim(v),'') is not null and position('{{'||p.key||'}}' in p_body)>0 and p.kind in ('money','percentage','number') then
  if replace(v,',','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'Enter a valid number for %',p.label; end if;
  if p.kind in ('money','percentage') then v:=round(replace(v,',','')::numeric,2)::text; end if;
 end if;
 result:=jsonb_set(result,array[p.key],to_jsonb(coalesce(v,'')));
end loop; return result; end $$;
revoke all on function hr_letters_private.resolve_fields(jsonb,text) from public,anon,authenticated;

create function public.hr_letters_admin_template_get(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform hr_letters_private.require_admin();
return (select to_jsonb(t)||jsonb_build_object('uploaded',exists(select 1 from public.hr_letter_uploads u where u.code=t.code),'history',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]'::jsonb) from public.hr_letter_template_versions v where v.code=t.code)) from public.hr_letter_templates t where t.code=p_code);
end $$;

create function public.hr_letters_admin_template_save(p_code text,p_expected text,p_title text,p_body text,p_reason text) returns text language plpgsql security definer set search_path='' as $$
declare t public.hr_letter_templates%rowtype; v text:=gen_random_uuid()::text;
begin perform hr_letters_private.require_admin(); perform hr_letters_private.validate_body(p_body);
if nullif(btrim(p_title),'') is null or length(p_title)>200 or nullif(btrim(p_reason),'') is null then raise exception 'Title and change reason required'; end if;
select * into t from public.hr_letter_templates where code=p_code for update;
if not found then raise exception 'Template not found'; end if;
if exists(select 1 from public.hr_letter_uploads where code=p_code) then raise exception 'For Word/PDF templates, upload a revised source as a new TP alternative'; end if;
if t.version is distinct from p_expected then raise exception 'Template changed elsewhere. Reload before saving.' using errcode='40001'; end if;
update public.hr_letter_templates set title=btrim(p_title),body=p_body,version=v,updated_at=now() where code=p_code;
insert into public.hr_letter_template_versions(code,version,title,body,actor_id,reason) values(p_code,v,btrim(p_title),p_body,auth.uid(),left(p_reason,2000));
insert into public.hr_letter_admin_audit(actor_id,action,object_key,before_value,after_value,reason) values(auth.uid(),'template_saved',p_code,to_jsonb(t),jsonb_build_object('version',v,'title',p_title,'body',p_body),left(p_reason,2000)); return v;
end $$;

create function public.hr_letters_admin_history() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform hr_letters_private.require_admin(); return (select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]'::jsonb) from (select id,actor_id,action,object_key,reason,created_at from public.hr_letter_admin_audit order by created_at desc limit 200) a); end $$;

create function public.hr_letters_admin_draft_get(p_letter uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform hr_letters_private.require_admin(); return (select to_jsonb(r)||jsonb_build_object('body',coalesce(r.fields->>'_draft_body',t.body),'uploaded',exists(select 1 from public.hr_letter_uploads where code=r.template_code)) from public.hr_letter_records r join public.hr_letter_templates t on t.code=r.template_code where r.id=p_letter); end $$;

create function public.hr_letters_admin_draft_edit(p_letter uuid,p_expected timestamptz,p_fields jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.hr_letter_records%rowtype; v text;
begin perform hr_letters_private.require_admin();
select * into r from public.hr_letter_records where id=p_letter for update;
if not found or r.status<>'draft' then raise exception 'Only draft letters can be edited'; end if;
if r.updated_at is distinct from p_expected then raise exception 'Draft changed elsewhere. Reload.' using errcode='40001'; end if;
if nullif(btrim(p_reason),'') is null then raise exception 'Change reason required'; end if;
perform public.hr_letters_admin_preview(r.template_code,r.employee_id,p_fields);
select version into v from public.hr_letter_templates where code=r.template_code;
update public.hr_letter_records set fields=p_fields,template_version=v,created_by=auth.uid(),updated_at=clock_timestamp() where id=p_letter;
insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'draft_edited',jsonb_build_object('previous_creator',r.created_by,'previous_fields',r.fields,'reason',left(p_reason,2000),'template_version',v));
insert into public.hr_letter_admin_audit(actor_id,action,object_key,before_value,after_value,reason) values(auth.uid(),'draft_edited',p_letter::text,jsonb_build_object('fields',r.fields,'creator',r.created_by),jsonb_build_object('fields',p_fields,'creator',auth.uid()),left(p_reason,2000));
end $$;

do $$ declare f record; begin for f in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname in ('hr_letters_placeholder_list','hr_letters_placeholder_save','hr_letters_admin_template_get','hr_letters_admin_template_save','hr_letters_admin_history','hr_letters_admin_draft_get','hr_letters_admin_draft_edit') loop execute format('revoke all on function %s from public,anon',f.sig); execute format('grant execute on function %s to authenticated',f.sig); end loop; end $$;

CREATE OR REPLACE FUNCTION public.hr_letters_admin_preview(p_code text, p_employee uuid, p_fields jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
 if p_fields ? '_draft_body' then
  if exists(select 1 from public.hr_letter_uploads where code=p_code) then raise exception 'Upload a revised Word/PDF source instead of overriding its body'; end if;
  t.body:=p_fields->>'_draft_body';
 end if;
 perform hr_letters_private.validate_body(t.body);
 v_values:=hr_letters_private.resolve_fields(v_values,t.body);
 v_text:=t.body;
 for v_match in select regexp_matches(t.body,'\{\{([a-zA-Z0-9_]+)\}\}','g') loop
  v_key:=v_match[1]; v_value:=nullif(btrim(v_values->>v_key),'');
  if v_key in ('current_basic','basic_increment','basic_increment_pct','revised_basic') and replace(v_value,',','') ~ '^-?[0-9]+([.][0-9]+)?$' then v_value:=round(replace(v_value,',','')::numeric,2)::text; end if;
  v_values:=jsonb_set(v_values,array[v_key],coalesce(to_jsonb(v_value),'""'::jsonb));
  if v_value is null and exists(select 1 from public.hr_letter_placeholders where key=v_key and not required) then
   v_text:=replace(v_text,'{{'||v_key||'}}','');
  elsif v_value is null then
   if not (v_missing ? v_key) then v_missing:=v_missing||to_jsonb(v_key); end if;
  else
   v_text:=replace(v_text,'{{'||v_key||'}}',v_value);
  end if;
 end loop;
 return jsonb_build_object('code',t.code,'title',t.title,'version',t.version,'employee_id',e.employee_id,'company_code',e.company_code,'company_name',v_company_name,'preview',v_text,'missing_fields',v_missing,'issuance_enabled',false,'values',v_values,'document',(select to_jsonb(u)||jsonb_build_object('optional_fields',(select coalesce(jsonb_agg(key),'[]'::jsonb) from public.hr_letter_placeholders where not required),'values',v_values,'text',v_text,'letterhead_mode',coalesce(p_fields->>'letterhead_mode','company'),'letterhead_code',e.company_code) from public.hr_letter_uploads u where u.code=p_code));
end $function$
;
CREATE OR REPLACE FUNCTION public.hr_letters_register_template(p_base text, p_path text, p_name text, p_format text, p_company text, p_body text, p_reusable boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare b public.hr_letter_templates%rowtype; n integer; c text; meta jsonb; expected text;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_format='docx' then perform hr_letters_private.validate_body(p_body); end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.hr_letters_admin_template_fields(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_body text; v_version text; v_title text; v_fields jsonb;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select t.body,t.version,t.title into v_body,v_version,v_title from public.hr_letter_templates t where t.code=p_code;
 if not found then raise exception 'Unknown letter template' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.field order by x.field),'[]'::jsonb) into v_fields from (select distinct m[1] as field from regexp_matches(v_body,'\{\{([a-zA-Z0-9_]+)\}\}','g') m) x;
 return jsonb_build_object('code',p_code,'title',v_title,'version',v_version,'fields',v_fields,'issuance_enabled',false,'body',v_body,'definitions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.hr_letter_placeholders p where v_fields ? p.key));
end $function$
;
commit;
