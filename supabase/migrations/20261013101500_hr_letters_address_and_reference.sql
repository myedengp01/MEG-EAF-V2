begin;
set local lock_timeout='3s';

-- Existing personal-detail permissions already allow gateway administrators to
-- read addresses. Expose only address text, never the rest of the personal row.
create function hr_letters_private.address_values(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare address text;
begin
 perform hr_letters_private.require_admin();
 select coalesce(nullif(btrim(correspondence_address),''),nullif(btrim(residential_address),''),'') into address
 from public.employee_personal_details where employee_id_ref=p_employee;
 return jsonb_build_object('address_line1',coalesce(address,''),'address_line2','','postcode_town','','state','');
end $$;
revoke all on function hr_letters_private.address_values(uuid) from public,anon,authenticated;

-- These are letter fields, not new permanent employee columns. Existing saved
-- free-text addresses stay together in line 1; other components are optional.
do $$ declare k text; old jsonb; begin
 foreach k in array array['address_line1','address_line2','postcode_town','state'] loop
  select to_jsonb(p) into old from public.hr_letter_placeholders p where key=k;
  insert into public.hr_letter_placeholders(key,label,kind,required,description)
  values(k,case k when 'address_line1' then 'Employee address / address line 1' when 'address_line2' then 'Address line 2' when 'postcode_town' then 'Postcode and town' else 'State' end,
  case when k='address_line1' then 'paragraph' else 'text' end,k='address_line1',
  'Prefilled from the saved correspondence address (residential address if absent). Free-text addresses stay together in line 1. Edit for this letter only; use Employee Master for permanent corrections.')
  on conflict(key) do update set label=excluded.label,kind=excluded.kind,required=excluded.required,description=excluded.description,revision=gen_random_uuid(),updated_at=now();
  insert into public.hr_letter_admin_audit(action,object_key,before_value,after_value,reason)
  values('placeholder_address_setup',k,old,(select to_jsonb(p) from public.hr_letter_placeholders p where key=k),'Requested standard employee address block; optional continuation lines');
 end loop;
end $$;

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
 if not coalesce((p_fields->>'_address_override')::boolean,exists(select 1 from jsonb_each_text(p_fields) f where f.key in ('address_line1','address_line2','postcode_town','state') and nullif(btrim(f.value),'') is not null)) then
  v_values:=v_values||hr_letters_private.address_values(p_employee);
 end if;
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
 return jsonb_build_object('code',p_code,'title',v_title,'version',v_version,'fields',v_fields,'issuance_enabled',false,'body',v_body,'uploaded',exists(select 1 from public.hr_letter_uploads where code=p_code),'definitions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.hr_letter_placeholders p where v_fields ? p.key));
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
 select coalesce(max(substring(code from '_TP([0-9]+)$')::integer),1)+1 into n from public.hr_letter_templates where split_part(code,'_TP',1)=p_base and code ~ '_TP[0-9]+$';
 c:=p_base||'_TP'||n;
 insert into public.hr_letter_templates(code,title,version,body,active) values(c,b.title,gen_random_uuid()::text,case when p_format='pdf' then 'Uploaded PDF: '||c||'. Review the attached document.' else p_body end,false);
 insert into public.hr_letter_uploads(code,base_code,storage_path,file_name,format,company_code,reusable,publication,created_by) values(c,p_base,p_path,p_name,p_format,p_company,p_reusable,case when p_reusable then 'pending' else 'private' end,auth.uid());
 insert into public.hr_letter_template_audit(code,actor_id,action,details) values(c,auth.uid(),'uploaded',jsonb_build_object('path',p_path,'company_code',p_company,'reusable',p_reusable));
 return c;
end $function$

;
insert into public.hr_letter_placeholders(key,label,kind) values('letter_date','letter date','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('employee_name','employee name','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('address_line1','address line1','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('address_line2','address line2','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('postcode_town','postcode town','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('state','state','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('resignation_date','resignation date','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('current_position','current position','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('company_name','company name','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('last_notice_date','last notice date','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('lastnotice_day','lastnotice day','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('start_datetime','start datetime','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('leave_entitlement','leave entitlement','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('months_worked','months worked','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('calculated_leaves','calculated leaves','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('al_asofdate','al asofdate','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('al_taken','al taken','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('al_balance','al balance','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('al_offset_period','al offset period','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('last_working_day','last working day','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('lastday_day','lastday day','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('authorized_signatory','authorized signatory','text') on conflict(key) do nothing;
insert into public.hr_letter_placeholders(key,label,kind) values('authorized_designation','authorized designation','text') on conflict(key) do nothing;
do $$ declare t public.hr_letter_templates%rowtype; b text; v text; begin
for t in select * from public.hr_letter_templates where not exists(select 1 from public.hr_letter_uploads u where u.code=hr_letter_templates.code) order by code for update loop
 if position('{{address_line1}}' in t.body)>0 then continue; end if;
 b:=regexp_replace(t.body,'(?im)^private\s*(and|&)\s*confidential\s*\n?','','g');
 b:=regexp_replace(b,'(?im)^Date:\s*\{\{letter_date\}\}\s*\n?','','g');
 b:='Date: {{letter_date}}
PRIVATE & CONFIDENTIAL

To:
{{employee_name}}
{{address_line1}}
{{address_line2}}
{{postcode_town}}
{{state}}

'||btrim(b); v:=gen_random_uuid()::text;
 perform hr_letters_private.validate_body(b);
 insert into public.hr_letter_template_versions(code,version,title,body,reason) values(t.code,t.version,t.title,t.body,'Before standard address layout') on conflict(code,version) do nothing;
 update public.hr_letter_templates set body=b,version=v,updated_at=now() where code=t.code;
 insert into public.hr_letter_template_versions(code,version,title,body,reason) values(t.code,v,t.title,b,'Standard letter date and employee address block');
 insert into public.hr_letter_admin_audit(action,object_key,before_value,after_value,reason) values('template_address_added',t.code,to_jsonb(t),jsonb_build_object('body',b,'version',v),'Requested standard recipient address on current digital letters');
end loop; end $$;
do $$ declare n integer; c text; v text:=gen_random_uuid()::text; b text:='Date: {{letter_date}}
PRIVATE & CONFIDENTIAL

To:
{{employee_name}}
{{address_line1}}
{{address_line2}}
{{postcode_town}}
{{state}}

Dear {{employee_name}},

Subject: Acceptance of Resignation and Confirmation of Final Working Day

We refer to your resignation letter dated [b]{{resignation_date}}[/b], concerning your position as [b]{{current_position}}[/b] with {{company_name}}.
The Company hereby acknowledges and accepts your resignation, subject to the following terms and arrangements.

[b]1. Resignation and Employment End Date[/b]
In accordance with your resignation notice and the Company''s acknowledgement, your official employment end date shall be [b]{{last_notice_date}} ({{lastnotice_day}})[/b].

[b]2. Accrued Annual Leave Entitlement and Offset Arrangement[/b]
In accordance with Section 60E of the Employment Act 1955, you are entitled to utilise your accrued annual leave before the termination of your employment, subject to the applicable statutory provisions.
Based on your employment period from [b]{{start_datetime}}[/b] to [b]{{last_notice_date}}[/b], your pro-rated annual leave entitlement has been calculated as follows:

Description | Details
Annual Leave Entitlement | {{leave_entitlement}} days per annum
Pro-rated Annual Leave | {{months_worked}}/12 × {{leave_entitlement}} days
Total Accrued Annual Leave | {{calculated_leaves}} days
Annual Leave Taken (as of {{al_asofdate}}) | {{al_taken}} days
Balance Annual Leave | {{al_balance}} days
Annual Leave Offset Period | {{al_offset_period}}
Final Physical Working Day | {{last_working_day}} ({{lastday_day}})
Official Employment End Date | {{last_notice_date}} ({{lastnotice_day}})

Accordingly, your remaining {{al_balance}} days of accrued annual leave shall be utilised during the final {{al_balance}} working days of your notice period, from [b]{{al_offset_period}}[/b].
Your final physical working day shall therefore be [b]{{last_working_day}} ({{lastday_day}})[/b], while your official employment end date shall remain [b]{{last_notice_date}} ({{lastnotice_day}})[/b].
Should either the Company or the Employee request an alternative arrangement, including an extension of the physical working period or a revision to the annual leave utilisation arrangement, such request may be considered subject to mutual agreement and written confirmation by both parties.
Any unused accrued annual leave remaining upon termination shall be settled in accordance with the applicable provisions of the Employment Act 1955.

[b]3. Duties and Responsibilities During Notice Period[/b]
Until your final physical working day, you are required to:
• Continue performing your assigned duties responsibly and professionally.
• Complete all outstanding assignments and responsibilities.
• Ensure a proper and comprehensive handover of all ongoing projects, documents, records and work-related matters.
• Cooperate with Management and designated personnel to ensure a smooth transition.
All handover responsibilities must be completed on or before [b]{{last_working_day}}[/b], unless otherwise mutually agreed in writing.

[b]4. Return of Company Property[/b]
You are required to return all Company property in your possession or under your responsibility on or before your final physical working day, including but not limited to:
• Employee Handbook and Company documents.
• Company uniforms, identification cards, keys and access devices, where applicable.
• Company equipment, electronic devices and other assigned assets.
• Work-related files, records, documents and materials.
• Any other property belonging to {{company_name}} or its related companies.
You must also ensure that all Company-related information, electronic records and access credentials are properly handed over to the authorised personnel.

[b]5. Confidentiality and Post-Employment Obligations[/b]
You are reminded that all confidential Company information, including business operations, financial information, customer records, employee information, business strategies and proprietary materials, must remain strictly confidential.
You shall not disclose, retain, reproduce or misuse such information after the termination of your employment, except as permitted by law or authorised by the Company.
You are also required to comply with all applicable post-employment obligations under your employment agreement, including any legally enforceable confidentiality and non-solicitation obligations.

[b]6. Final Salary and Employment Settlement[/b]
Your final salary and any other employment entitlements payable up to [b]{{last_notice_date}}[/b] shall be calculated and processed in accordance with your employment contract, Company policies and applicable Malaysian employment laws.
The final settlement shall include, where applicable:
• Salary earned up to the official employment end date.
• Reconciliation of accrued and utilised annual leave.
• Payment for any unused accrued annual leave, where required by law.
• Applicable statutory contributions and deductions.
• Any other lawful payments or deductions arising from your employment.
All outstanding duties, handover arrangements and return of Company property must be completed as required. Any outstanding clearance matters shall be addressed separately without prejudice to the Employee''s statutory entitlement to timely payment of wages.

[b]7. Changes to the Agreed Arrangement[/b]
Should either party request a change to the confirmed final physical working day, annual leave offset arrangement or official employment end date, the proposed changes must be communicated and mutually agreed upon in writing.
No unilateral change shall be made to the agreed arrangement, except where otherwise permitted or required by applicable law. Any mutually agreed revision shall be documented and acknowledged by both parties.

[b]8. Acknowledgement and Appreciation[/b]
The Company appreciates your contributions and services during your employment with {{company_name}}.
We thank you for your efforts and wish you success in your future endeavours.

Yours sincerely,
For and on behalf of {{company_name}}
Name: {{authorized_signatory}}
Designation: {{authorized_designation}}

Employee Acknowledgement
I, {{employee_name}}, hereby acknowledge receipt of this Resignation Acceptance Letter and the arrangements stated herein concerning my final physical working day, accrued annual leave utilisation, official employment end date and handover obligations.

Employee Signature: __________________________
Name: {{employee_name}}
NRIC: __________________________
Date: __________________________'; begin
 perform hr_letters_private.validate_body(b);
 perform 1 from public.hr_letter_templates where code='RL' for update;
 select coalesce(max(substring(code from '_TP([0-9]+)$')::integer),1)+1 into n from public.hr_letter_templates where split_part(code,'_TP',1)='RL' and code ~ '_TP[0-9]+$';
 c:='RL_TP'||n;
 insert into public.hr_letter_templates(code,title,version,body,active) values(c,'Resignation Acceptance Letter — Annual Leave Offset',v,b,false);
 insert into public.hr_letter_template_versions(code,version,title,body,reason) values(c,v,'Resignation Acceptance Letter — Annual Leave Offset',b,'Company-neutral digital adaptation of supplied reference; example values removed');
 insert into public.hr_letter_admin_audit(action,object_key,after_value,reason) values('template_created',c,jsonb_build_object('body',b,'version',v),'User supplied resignation sample; reusable across legal entities; employee sample data excluded');
end $$;
commit;
