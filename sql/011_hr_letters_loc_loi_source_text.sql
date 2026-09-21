-- Source: MYEDEN_Letter_of_Confirmation_and_Salary_Increment_Template_No_MVC.docx
-- Only LOC_LOI has verified source text; retain active=false until secured issuance workflow passes tests.
update public.hr_letter_templates set body=$letter$LETTER OF CONFIRMATION OF EMPLOYMENT
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
Date: ____________________$letter$,version='v2026.09.21-14:30-source-no-mvc',updated_at=now(),active=false where code='LOC_LOI' and active=false;
