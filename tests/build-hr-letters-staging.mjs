// Generates an atomic database fixture only; never connects to a project.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
export async function buildStaging(project){
 if(project!=='fjesgcsumbuniatyaeee')throw Error('Only the selected staging project is allowed');
 const parts=[`begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
 if to_regclass('public.employee_master') is not null or to_regclass('public.hr_letter_templates') is not null or to_regclass('public.hr_letter_records') is not null or to_regclass('public.hr_letter_audit') is not null or exists(select 1 from pg_namespace where nspname='hr_letters_private') or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hr_letters_%') then
  raise exception 'Refuse to overwrite existing Employee Master or HR Letters objects';
 end if;
 if to_regclass('public.jd_entities') is null or to_regprocedure('public.eaf_v2_is_admin(uuid)') is null then raise exception 'Existing staging prerequisites required'; end if;
end $$;
create table public.employee_master(id uuid primary key,employee_id text,employee_name text,company_code text,department text,approved_job_title text,final_salary numeric);
alter table public.employee_master enable row level security;
revoke all on public.employee_master from public,anon,authenticated;
insert into public.employee_master values
 ('00000000-0000-4000-8000-00000000ed01','EDP-DUMMY-001','EDP Dummy Employee','MEG','Test','Test Position',0);
`];
 for(const file of ['009_hr_letters_v1_schema.sql','010_hr_letters_template_registry.sql','011_hr_letters_loc_loi_source_text.sql','012_hr_letters_admin_readonly_gateway.sql','013_hr_letters_admin_employee_and_field_metadata.sql','014_hr_letters_admin_preview.sql','015_hr_letters_admin_draft_workflow.sql','016_hr_letters_employee_position_contract_fix.sql','017_hr_letters_distinct_approval.sql','018_hr_letters_issuance_and_immutability.sql']){
  let sql=await read('../sql/'+file);
  // Gateway registration needs the full gateway schema; retain the actual template RPC.
  if(file.startsWith('012'))sql=sql.slice(sql.indexOf('create or replace function'));
  parts.push(sql);
 }
 for(const file of ['20260924044224_hr_letters_company_names.sql','20260925004232_hr_letters_restore_inactive_templates.sql']){
  const sql=await read('../supabase/migrations/'+file);
  parts.push(sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''));
 }
 return parts.join('\n')+'\ncommit;\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(await buildStaging(process.argv[2]));
