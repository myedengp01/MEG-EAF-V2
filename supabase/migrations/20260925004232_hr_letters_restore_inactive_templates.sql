-- REVIEW ONLY: restore captured inactive templates after schema 009, registry 010 and source 011.
-- This is not deployment approval. Does not touch employees, letters, roles or issued snapshots.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
lock table public.hr_letter_templates in share row exclusive mode;
create temporary table edp_template_restore(code text primary key,title text,version text,body text,active boolean) on commit drop;
insert into edp_template_restore values
(E'DI',E'Domestic Inquiry Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Notice to Attend Domestic Inquiry
Dear {{employee_name}},
We refer to {{show_cause_reference_and_date}} and your written explanation dated {{explanation_date}}, where applicable.
The Company has decided to convene a Domestic Inquiry to examine the following allegation(s):
{{specific_allegations}}
The inquiry arrangements are:
Date: {{inquiry_date}}
Time: {{inquiry_time}}
Venue or approved meeting arrangement: {{inquiry_venue}}
Inquiry panel or chairperson: {{panel_details}}
Coordinating officer: {{coordinator}}
The inquiry is intended to examine the available evidence and provide you with an opportunity to respond to the allegation(s), present relevant information and identify relevant witnesses, subject to the applicable inquiry procedure.
{{documents_and_witness_arrangements}}
Please confirm receipt of this notice and direct any procedural questions or reasonable requests for an adjustment to {{coordinator}} by {{confirmation_deadline}}.
No finding of misconduct is made by this notice. Any decision will follow consideration of the inquiry proceedings and relevant evidence.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'EL',E'Explanation Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Request for Written Explanation Regarding {{matter_subject}}
Dear {{employee_name}},
Management seeks your written explanation regarding the following matter:
Date and time: {{incident_datetime}}
Location or relevant work area: {{incident_location}}
Matter requiring clarification: {{factual_description}}
Relevant records or information: {{supporting_information}}
At this stage, the Company is seeking clarification and has not reached a disciplinary finding through this letter.
Please provide your written explanation, together with any relevant documents or information, to {{response_recipient}} by {{response_deadline}}.
If you require clarification or a reasonable extension, please contact {{contact_person}} before the deadline.
The Company will consider your response and the available information before determining whether any further action is necessary.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'LOC',E'Letter of Confirmation',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Confirmation of Employment
Dear {{employee_name}},
We are pleased to inform you that, following the completion of your probationary review, Management has approved the confirmation of your employment with {{company_name}}, effective {{confirmation_date}}.
Your confirmed position is {{position}}, under the {{department}} department.
All other terms and conditions stated in your Letter of Employment, Employee Handbook and applicable Company policies shall remain unchanged unless expressly amended in writing.
We congratulate you on your confirmation and look forward to your continued contribution, professionalism and growth with the Company.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter.
Signature: ____________________ Name: {{employee_name}} Date: ____________________',false),
(E'LOC_LOI',E'Letter of Confirmation and Increment',E'v2026.09.21-14:30-source-no-mvc',E'LETTER OF CONFIRMATION OF EMPLOYMENT
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
Date: ____________________',false),
(E'LOI',E'Letter of Increment',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
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
Signature: ____________________ Date: ____________________',false),
(E'LOP',E'Letter of Promotion',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Promotion to {{new_position}}
Dear {{employee_name}},
We are pleased to inform you that Management has approved your promotion, effective {{effective_date}}, with the following details:
Item | Current | Revised
Position | {{current_position}} | {{new_position}}
Department | {{current_department}} | {{new_department}}
Grade | {{current_grade}} | {{new_grade}}
Reporting to | {{current_reporting_manager}} | {{new_reporting_manager}}
Basic salary | RM {{current_basic}} | RM {{revised_basic}}
Your responsibilities and reporting arrangements shall follow the approved Job Description attached as Appendix A.
You are expected to carry out your revised responsibilities with professionalism, accountability and compliance with Company policies.
All other terms and conditions of employment remain unchanged unless expressly amended in this letter or another written agreement.
We congratulate you on your promotion and look forward to your continued leadership and contribution.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this promotion letter and its attached Job Description.
Signature: ____________________ Date: ____________________
Appendix A: Approved Job Description, reference {{jd_reference}}, version {{jd_version}}.',false),
(E'PEL',E'Probation Extension Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Extension of Probationary Period
Dear {{employee_name}},
We refer to your probationary employment and the review conducted on {{review_date}}.
Following the review, Management has decided to extend your probationary period from {{current_probation_end_date}} to {{revised_probation_end_date}}, subject to the terms of your employment agreement and applicable requirements.
The extension is intended to provide an additional period for assessment and improvement in the following areas:
{{improvement_areas}}
During the extension, you will be expected to meet the following objectives:
{{performance_objectives}}
Your progress will be reviewed on {{next_review_date}}. Your reporting manager will provide relevant feedback and support during this period.
The extension does not constitute confirmation of employment. Management will communicate the outcome of the subsequent review in writing.
All other terms and conditions of employment remain unchanged unless expressly amended in writing.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: I acknowledge receipt of this letter.
Signature: ____________________ Date: ____________________',false),
(E'PIP',E'Performance Improvement Plan',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Performance Improvement Plan
Dear {{employee_name}},
Following the performance discussion held on {{discussion_date}}, the Company is placing you on a Performance Improvement Plan for the period {{pip_start_date}} to {{pip_end_date}}.
The purpose of this plan is to identify performance gaps, establish measurable expectations and provide a structured opportunity for improvement.
1. Areas requiring improvement: {{performance_gaps_with_evidence}}
2. Required outcomes and measures: {{measurable_targets_and_deadlines}}
3. Support provided: {{training_coaching_resources_and_support}}
4. Review schedule: Progress reviews will take place on {{review_dates}}, with a final review scheduled for {{final_review_date}}.
5. Assessment and possible outcomes: The Company will assess progress against the documented objectives, taking account of the evidence, support provided and your response. Possible outcomes include successful completion, an appropriately documented extension or further action consistent with the employment agreement, Company policies and applicable law.
You are encouraged to discuss any obstacles or support requirements with {{review_manager}}.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________
Appendix A: PIP objectives, measurements, evidence and review records.',false),
(E'RL',E'Resignation Acceptance Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Acceptance of Resignation
Dear {{employee_name}},
We refer to your resignation submitted on {{resignation_date}} from your position as {{position}} with {{company_name}}.
The Company acknowledges and accepts your resignation.
1. Notice period and last working day
Your applicable notice requirement is {{notice_period}}, subject to the terms of your employment agreement and applicable law.
Your agreed last working day is {{last_working_day}}.
{{notice_adjustment_details}}
2. Handover
You are required to complete the handover of your duties, outstanding assignments, records and relevant access arrangements to {{handover_recipient}} by {{handover_deadline}}.
3. Company property
Please return all Company property, documents, equipment and access items by {{property_return_date}}.
4. Leave and final settlement
Your final leave balance and employment payments will be reconciled by HR and Payroll. Any payment in lieu of notice, adjustment or deduction will be assessed separately against the employment agreement and applicable law.
5. Confidentiality
Your continuing confidentiality and other valid post-employment obligations remain subject to your employment agreement and applicable law.
We thank you for your service and wish you well in your future endeavours.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'SAL',E'Suspension / Administrative Leave Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Notice of {{leave_or_suspension_type}}
Dear {{employee_name}},
We refer to {{matter_reference}}.
The Company has decided to place you on {{leave_or_suspension_type}} under the following arrangements:
Commencement: {{start_datetime}}
Expected end or review date: {{end_or_review_date}}
Remuneration arrangement: {{verified_pay_arrangement}}
Attendance and reporting instructions: {{attendance_instructions}}
Contact person: {{contact_person}}
Purpose and status: {{approved_purpose_and_status}}
This arrangement is {{precautionary_or_disciplinary_status}}. Where it is pending investigation or inquiry, no finding of misconduct is made through this letter.
During this period, you are required to remain reasonably contactable through {{contact_method}} and comply with the specific instructions below:
{{proportionate_and_approved_conditions}}
Any change to the duration, remuneration or reporting arrangements will be communicated in writing. HR must verify the applicable legal and contractual requirements before this letter is issued.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'SCL',E'Show Cause Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Notice to Show Cause — {{allegation_subject}}
Dear {{employee_name}},
The Company is considering the following allegation concerning your conduct:
Allegation: {{specific_allegation}}
Date, time and location: {{incident_details}}
Particulars and supporting information: {{factual_particulars_and_evidence}}
Relevant contractual or policy provision, where applicable: {{relevant_provision}}
You are required to provide a written explanation stating why disciplinary action should not be considered in relation to the allegation.
Please submit your response and any supporting information to {{response_recipient}} by {{reasonable_response_deadline}}.
If you require clarification, access to relevant information or a reasonable extension, please contact {{contact_person}} promptly.
No final disciplinary finding has been made through this notice. Your explanation and the available evidence will be considered before the Company decides whether further investigation, a domestic inquiry or other action is appropriate.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'TL',E'Termination Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Notice of Termination of Employment
Dear {{employee_name}},
We refer to {{relevant_correspondence_and_process}}.
Following {{documented_decision_basis}}, the Company hereby gives you written notice of termination of your employment in accordance with {{applicable_contractual_or_legal_basis}}.
The termination arrangements are as follows:
Notice issued on: {{letter_date}}
Applicable notice period or approved payment in lieu: {{notice_arrangement}}
Last day of employment: {{employment_end_date}}
Last day required to attend work, if different: {{last_attendance_date}}
Reason and decision record: {{approved_reason_and_decision_details}}
Handover and Company property: You are required to complete the handover arrangements communicated by {{handover_manager}} and return Company property by {{return_deadline}}.
Final payments and benefits: HR and Payroll will calculate all amounts lawfully payable, including applicable salary, leave and other entitlements. Any proposed deduction or recovery will be separately verified for legal and contractual compliance.
{{appeal_or_review_information_if_applicable}}
Your confidentiality and other valid continuing obligations remain subject to your employment agreement and applicable law.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false),
(E'TRL',E'Transfer Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: Transfer of Employment Assignment
Dear {{employee_name}},
We refer to the proposed transfer discussed with you on {{discussion_date}}.
Management has approved the following transfer arrangements, effective {{effective_date}}:
Item | Current | Revised
Work location | {{current_location}} | {{new_location}}
Department | {{current_department}} | {{new_department}}
Position | {{current_position}} | {{new_position}}
Reporting manager | {{current_manager}} | {{new_manager}}
Reason for transfer: {{transfer_reason}}
Transfer arrangement: {{transfer_type}}
Your responsibilities, reporting arrangements and any applicable handover requirements will be communicated by Management.
{{approved_remuneration_or_allowance_changes}}
All other employment terms remain unchanged unless expressly amended in writing. Any transfer involving a change of legal employer or contractual terms requiring agreement shall be documented separately and shall not take effect solely through this letter.
Please acknowledge receipt of this letter and complete the required handover by {{handover_date}}.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: Signature: ____________________ Date: ____________________',false),
(E'UAL',E'Unpaid Leave Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: {{leave_decision}} — Unpaid Leave Application
Dear {{employee_name}},
We refer to your application for unpaid leave submitted on {{application_date}}.
Management has {{leave_decision}} your application with the following details:
Leave period: {{leave_start_date}} to {{leave_end_date}}
Total unpaid leave: {{approved_leave_days}} day(s)
Reason recorded: {{leave_reason}}
Expected return-to-work date: {{return_date}}
{{decision_specific_conditions}}
Where unpaid leave is approved, the relevant payroll adjustments and statutory contribution treatment will be determined by Payroll in accordance with applicable requirements. No deduction amount is authorized solely by this letter.
You are required to inform your reporting manager promptly if your circumstances change or you are unable to return on the expected date.
All other terms and conditions of employment remain unchanged.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement: Signature: ____________________ Date: ____________________',false),
(E'WL',E'Warning Letter',E'v2026.09.22-director-approved-1',E'PRIVATE & CONFIDENTIAL
Subject: {{warning_level}} Written Warning — {{matter_subject}}
Dear {{employee_name}},
We refer to the following matter and the process undertaken:
{{incident_and_process_summary}}
After considering {{employee_explanation_and_evidence_considered}}, Management has reached the following findings:
{{approved_findings}}
The Company is issuing you a {{warning_level}} written warning in relation to these findings.
You are required to: {{corrective_actions_and_expectations}}
The expected improvement or compliance date is {{compliance_deadline}}. Your progress will be reviewed by {{review_manager}}.
Any further incident will be assessed on its own facts and may result in further action consistent with Company policies, your employment agreement and applicable law.
{{appeal_or_review_process_if_applicable}}
You are expected to maintain professional conduct and comply with all applicable Company policies.
Yours faithfully,
For and on behalf of {{company_name}}
{{authorized_signatory}}
Employee Acknowledgement of Receipt: Signature: ____________________ Date: ____________________',false);
do $$ begin
 if exists(select 1 from public.hr_letter_templates t join edp_template_restore s using(code)
   where t.active or (length(btrim(t.body))>0 and (replace(t.body,E'\r\n',E'\n') is distinct from s.body or t.version is distinct from s.version or t.title is distinct from s.title))) then
   raise exception 'Template drift or active template detected; review before restoring';
 end if;
end $$;
insert into public.hr_letter_templates(code,title,version,body,active)
 select code,title,version,body,false from edp_template_restore where true
 on conflict(code) do update set title=excluded.title,version=excluded.version,body=excluded.body,active=false,updated_at=now()
 where not hr_letter_templates.active and hr_letter_templates.body is distinct from excluded.body;
commit;
