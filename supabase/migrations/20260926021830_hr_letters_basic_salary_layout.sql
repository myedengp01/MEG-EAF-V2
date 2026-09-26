begin;
set local lock_timeout='2s';
-- Add company_name to the existing directory; restore its authenticated-only ACL.
drop function public.hr_letters_admin_employees();
create function public.hr_letters_admin_employees()
returns table(id uuid,employee_id text,employee_name text,company_code text,department text,"position" text,company_name text,current_basic numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 return query select e.id,e.employee_id,e.employee_name,e.company_code,e.department,e.approved_job_title,hr_letters_private.company_name(e.company_code),e.final_salary
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
 v_values:=p_fields || jsonb_build_object('employee_name',coalesce(e.employee_name,''),'employee_id',coalesce(e.employee_id,''),'company_name',v_company_name,'department',coalesce(e.department,''),'position',coalesce(e.approved_job_title,''),'current_position',coalesce(e.approved_job_title,''),'current_department',coalesce(e.department,''),'current_basic',coalesce(e.final_salary::text,''));
 if nullif(p_fields->>'letterhead_code','') is not null and upper(btrim(p_fields->>'letterhead_code'))<>upper(btrim(e.company_code)) then raise exception 'Letterhead must match employee company' using errcode='22023'; end if;
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


do $$ begin
 if exists(select 1 from public.hr_letter_templates where code='LOC_LOI' and replace(body,E'\r\n',E'\n') not in (E'LETTER OF CONFIRMATION OF EMPLOYMENT
AND SALARY INCREMENT
Date: {{letter_date}}
Private & Confidential

Employee Name: {{employee_name}}
Employee ID: {{employee_id}}
Position: {{position}}
Department: {{department}}

Subject: Confirmation of Employment and Salary Increment
We are pleased to inform you that following a review of your overall performance, conduct, attendance, competency and contribution during your probationary period, Management has approved your confirmation as a permanent employee of the Company.
Accordingly, your employment confirmation and revised remuneration package shall take effect from {{effective_date}}.

Description | Current | Increment | Increment (%) | Revised
Basic Salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}
Total Gross Monthly Salary | RM {{current_gross}} | RM {{gross_increment}} | {{gross_increment_pct}} % | RM {{revised_gross}}

Terms and Conditions
Your employment is hereby confirmed effective from the date stated above.
All other terms and conditions contained in your Letter of Employment, Employee Handbook and Company Policies remain unchanged.
Future salary increments, bonuses, incentives, allowances and other benefits shall remain at the sole discretion of the Company and will be based on performance, appraisal results, operational requirements and business performance.
You are expected to continue maintaining satisfactory performance, professionalism, integrity, attendance and compliance with all Company policies.
The Management congratulates you on your confirmation and thanks you for your continued dedication and contribution. We look forward to your continued growth and success with the Company.

Yours faithfully,
For and on behalf of
MYEDEN GROUP SDN. BHD.

_________________________
Authorized Signatory

Employee Acknowledgement
I acknowledge receipt of this Letter of Confirmation of Employment and Salary Increment and accept the revised terms stated herein.

Employee Signature: ____________________
Name: ____________________
NRIC: ____________________
Date: ____________________',E'LETTER OF CONFIRMATION OF EMPLOYMENT
AND SALARY INCREMENT
Date: {{letter_date}}
Private & Confidential

Employee Name: {{employee_name}}
Employee ID: {{employee_id}}
Position: {{position}}
Department: {{department}}

Subject: Confirmation of Employment and Salary Increment
We are pleased to inform you that following a review of your overall performance, conduct, attendance, competency and contribution during your probationary period, Management has approved your confirmation as a permanent employee of the Company.
Accordingly, your employment confirmation and revised remuneration package shall take effect from {{effective_date}}.

Description | Current | Increment | Increment (%) | Revised
Basic Salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}

Terms and Conditions
Your employment is hereby confirmed effective from the date stated above.
All other terms and conditions contained in your Letter of Employment, Employee Handbook and Company Policies remain unchanged.
Future salary increments, bonuses, incentives, allowances and other benefits shall remain at the sole discretion of the Company and will be based on performance, appraisal results, operational requirements and business performance.
You are expected to continue maintaining satisfactory performance, professionalism, integrity, attendance and compliance with all Company policies.
The Management congratulates you on your confirmation and thanks you for your continued dedication and contribution. We look forward to your continued growth and success with the Company.

Yours faithfully,
For and on behalf of
{{company_name}}

_________________________
Authorized Signatory

Employee Acknowledgement
I acknowledge receipt of this Letter of Confirmation of Employment and Salary Increment and accept the revised terms stated herein.

Employee Signature: ____________________
Name: ____________________
NRIC: ____________________
Date: ____________________')) then raise exception 'Template drift: LOC_LOI'; end if;
end $$;
update public.hr_letter_templates set body=E'LETTER OF CONFIRMATION OF EMPLOYMENT
AND SALARY INCREMENT
Date: {{letter_date}}
Private & Confidential

Employee Name: {{employee_name}}
Employee ID: {{employee_id}}
Position: {{position}}
Department: {{department}}

Subject: Confirmation of Employment and Salary Increment
We are pleased to inform you that following a review of your overall performance, conduct, attendance, competency and contribution during your probationary period, Management has approved your confirmation as a permanent employee of the Company.
Accordingly, your employment confirmation and revised remuneration package shall take effect from {{effective_date}}.

Description | Current | Increment | Increment (%) | Revised
Basic Salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}

Terms and Conditions
Your employment is hereby confirmed effective from the date stated above.
All other terms and conditions contained in your Letter of Employment, Employee Handbook and Company Policies remain unchanged.
Future salary increments, bonuses, incentives, allowances and other benefits shall remain at the sole discretion of the Company and will be based on performance, appraisal results, operational requirements and business performance.
You are expected to continue maintaining satisfactory performance, professionalism, integrity, attendance and compliance with all Company policies.
The Management congratulates you on your confirmation and thanks you for your continued dedication and contribution. We look forward to your continued growth and success with the Company.

Yours faithfully,
For and on behalf of
{{company_name}}

_________________________
Authorized Signatory

Employee Acknowledgement
I acknowledge receipt of this Letter of Confirmation of Employment and Salary Increment and accept the revised terms stated herein.

Employee Signature: ____________________
Name: ____________________
NRIC: ____________________
Date: ____________________',version='v2026.09.26-basic-only',updated_at=now() where code='LOC_LOI' and body is distinct from E'LETTER OF CONFIRMATION OF EMPLOYMENT
AND SALARY INCREMENT
Date: {{letter_date}}
Private & Confidential

Employee Name: {{employee_name}}
Employee ID: {{employee_id}}
Position: {{position}}
Department: {{department}}

Subject: Confirmation of Employment and Salary Increment
We are pleased to inform you that following a review of your overall performance, conduct, attendance, competency and contribution during your probationary period, Management has approved your confirmation as a permanent employee of the Company.
Accordingly, your employment confirmation and revised remuneration package shall take effect from {{effective_date}}.

Description | Current | Increment | Increment (%) | Revised
Basic Salary | RM {{current_basic}} | RM {{basic_increment}} | {{basic_increment_pct}} % | RM {{revised_basic}}

Terms and Conditions
Your employment is hereby confirmed effective from the date stated above.
All other terms and conditions contained in your Letter of Employment, Employee Handbook and Company Policies remain unchanged.
Future salary increments, bonuses, incentives, allowances and other benefits shall remain at the sole discretion of the Company and will be based on performance, appraisal results, operational requirements and business performance.
You are expected to continue maintaining satisfactory performance, professionalism, integrity, attendance and compliance with all Company policies.
The Management congratulates you on your confirmation and thanks you for your continued dedication and contribution. We look forward to your continued growth and success with the Company.

Yours faithfully,
For and on behalf of
{{company_name}}

_________________________
Authorized Signatory

Employee Acknowledgement
I acknowledge receipt of this Letter of Confirmation of Employment and Salary Increment and accept the revised terms stated herein.

Employee Signature: ____________________
Name: ____________________
NRIC: ____________________
Date: ____________________';

do $$ begin
 if exists(select 1 from public.hr_letter_templates where code='LOI' and replace(body,E'\r\n',E'\n') not in (E'PRIVATE & CONFIDENTIAL
Subject: Revision of Salary
Dear {{employee_name}},
We are pleased to inform you that Management has approved a revision to your remuneration, effective {{effective_date}}.
Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}
Gross monthly salary | RM {{current_gross}} | RM {{gross_increment}} | RM {{revised_gross}}
The revised remuneration shall be reflected in the applicable payroll period, subject to normal payroll processing and statutory deductions.
All other employment terms and conditions remain unchanged unless expressly amended in writing.
Future salary reviews, increments, bonuses and other discretionary benefits are subject to applicable Company policies and Management approval.
We thank you for your contribution and look forward to your continued performance and commitment.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter and the remuneration revision stated above.
Signature: ____________________ Date: ____________________',E'PRIVATE & CONFIDENTIAL
Subject: Revision of Salary
Dear {{employee_name}},
We are pleased to inform you that Management has approved a revision to your remuneration, effective {{effective_date}}.
Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}
The revised remuneration shall be reflected in the applicable payroll period, subject to normal payroll processing and statutory deductions.
All other employment terms and conditions remain unchanged unless expressly amended in writing.
Future salary reviews, increments, bonuses and other discretionary benefits are subject to applicable Company policies and Management approval.
We thank you for your contribution and look forward to your continued performance and commitment.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter and the remuneration revision stated above.
Signature: ____________________ Date: ____________________')) then raise exception 'Template drift: LOI'; end if;
end $$;
update public.hr_letter_templates set body=E'PRIVATE & CONFIDENTIAL
Subject: Revision of Salary
Dear {{employee_name}},
We are pleased to inform you that Management has approved a revision to your remuneration, effective {{effective_date}}.
Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}
The revised remuneration shall be reflected in the applicable payroll period, subject to normal payroll processing and statutory deductions.
All other employment terms and conditions remain unchanged unless expressly amended in writing.
Future salary reviews, increments, bonuses and other discretionary benefits are subject to applicable Company policies and Management approval.
We thank you for your contribution and look forward to your continued performance and commitment.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter and the remuneration revision stated above.
Signature: ____________________ Date: ____________________',version='v2026.09.26-basic-only',updated_at=now() where code='LOI' and body is distinct from E'PRIVATE & CONFIDENTIAL
Subject: Revision of Salary
Dear {{employee_name}},
We are pleased to inform you that Management has approved a revision to your remuneration, effective {{effective_date}}.
Description | Current | Increment | Revised
Basic monthly salary | RM {{current_basic}} | RM {{basic_increment}} | RM {{revised_basic}}
The revised remuneration shall be reflected in the applicable payroll period, subject to normal payroll processing and statutory deductions.
All other employment terms and conditions remain unchanged unless expressly amended in writing.
Future salary reviews, increments, bonuses and other discretionary benefits are subject to applicable Company policies and Management approval.
We thank you for your contribution and look forward to your continued performance and commitment.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter and the remuneration revision stated above.
Signature: ____________________ Date: ____________________';

commit;
