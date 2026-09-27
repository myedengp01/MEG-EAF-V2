-- MEG-HR-LMS V1.0 v2026.09.21-14:30
-- Applied to Supabase project vzngfswtofegimfcoigx on 2026-09-21.
-- Do not activate until exact approved letter wording is imported and reviewed.
insert into public.hr_letter_templates(code,title,version,body,active) values
('RL','Resignation Acceptance Letter','v2026.09.21-14:30','',false),
('LOP','Letter of Promotion','v2026.09.21-14:30','',false),
('LOC_LOI','Letter of Confirmation and Increment','v2026.09.21-14:30','',false),
('EL','Explanation Letter','v2026.09.21-14:30','',false),
('DI','Domestic Inquiry Letter','v2026.09.21-14:30','',false),
('SAL','Suspension / Administrative Leave Letter','v2026.09.21-14:30','',false),
('UAL','Unpaid Leave Letter','v2026.09.21-14:30','',false),
('TRL','Transfer Letter','v2026.09.21-14:30','',false),
('TL','Termination Letter','v2026.09.21-14:30','',false),
('PIP','Performance Improvement Plan','v2026.09.21-14:30','',false),
('WL','Warning Letter','v2026.09.21-14:30','',false),
('PEL','Probation Extension Letter','v2026.09.21-14:30','',false),
('SCL','Show Cause Letter','v2026.09.21-14:30','',false),
('LOI','Letter of Increment','v2026.09.21-14:30','',false),
('LOC','Letter of Confirmation','v2026.09.21-14:30','',false)
on conflict (code) do nothing;
