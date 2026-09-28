import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8'),db=new PGlite();
try{
await db.exec(await read('fixtures/admin-role-baseline.sql'));
await db.exec(`create table employee_master(id uuid primary key,employee_id text,employee_name text,company_code text,department text,approved_job_title text,final_salary numeric);create table jd_entities(code text,name text,is_active boolean);create schema storage;grant usage on schema storage to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;`);
await db.exec((await read('../sql/009_hr_letters_v1_schema.sql')).replace('create extension if not exists pgcrypto;',''));
for(const n of ['013_hr_letters_admin_employee_and_field_metadata.sql','014_hr_letters_admin_preview.sql','015_hr_letters_admin_draft_workflow.sql','016_hr_letters_employee_position_contract_fix.sql','017_hr_letters_distinct_approval.sql','018_hr_letters_issuance_and_immutability.sql'])await db.exec(await read('../sql/'+n));
await db.exec(await read('../supabase/migrations/20260924044224_hr_letters_company_names.sql'));
await db.exec(await read('../supabase/migrations/20260927235954_hr_letters_uploaded_templates.sql'));
const admin='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',superuser='00000000-0000-4000-8000-000000000003',ordinary='00000000-0000-4000-8000-000000000004',employee='00000000-0000-4000-8000-000000000010';
for(const id of [admin,other,superuser,ordinary]){await db.query('insert into auth.users values($1,now(),null);',[id]);await db.query('insert into eaf_staff_profiles values($1)',[id]);await db.query('insert into eaf_v2_staff_permissions(user_id,is_admin,is_super_admin) values($1,$2,$3)',[id,id!==ordinary,id===superuser]);}
await db.query("insert into employee_master values($1,'DUMMY','Dummy','MEG','Test','Test',2300)",[employee]);await db.exec("insert into jd_entities values('MEG','Test MEG',true),('HD','Test HD',true);insert into hr_letter_templates(code,title,version,body) values('LOC','Letter of Confirmation','base','Dear {{employee_name}}');");
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')};
const path=admin+'/00000000-0000-4000-8000-000000000020.docx';await db.query("insert into storage.objects values('hr-letter-sources',$1,$2,'{\"size\":100,\"mimetype\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\"}')",[path,admin]);
const register=()=>db.query("select hr_letters_register_template('LOC',$1,'test.docx','docx','MEG','Dear {{employee_name}} basic {{current_basic}} date {{letter_date}}',true) code",[path]);
await actor(ordinary);await assert.rejects(register,e=>e.code==='42501');await actor(other);await assert.rejects(register,/Invalid upload path/);await actor(admin);
const code=(await register()).rows[0].code;assert.equal(code,'LOC_TP2');await assert.rejects(register,e=>e.code==='23505');
assert.equal((await db.query('select count(*)::int n from hr_letters_uploaded_templates()')).rows[0].n,1);
await assert.rejects(()=>db.query('select * from hr_letter_uploads'),e=>e.code==='42501');
await actor(other);assert.equal((await db.query('select count(*)::int n from hr_letters_uploaded_templates()')).rows[0].n,0);await assert.rejects(()=>db.query("select hr_letters_admin_save_draft($1,$2,'{}')",[employee,code]),e=>e.code==='42501');
await actor(admin);const preview=async fields=>(await db.query('select hr_letters_admin_preview($1,$2,$3) p',[code,employee,JSON.stringify(fields)])).rows[0].p;
let p=await preview({current_basic:999,letterhead_mode:'included'});assert.equal(p.document.values.current_basic,'2300.00');assert.deepEqual(p.missing_fields,['letter_date']);assert.equal(p.document.storage_path,path);
await assert.rejects(()=>preview({letterhead_code:'HD'}),/Letterhead/);await assert.rejects(()=>preview({letterhead_mode:'bad'}),/Invalid letterhead/);
await assert.rejects(()=>db.query('select hr_letters_publish_template($1,true)',[code]),e=>e.code==='42501');
await actor(superuser);await db.query('select hr_letters_publish_template($1,true)',[code]);await actor(other);assert.equal((await db.query('select count(*)::int n from hr_letters_uploaded_templates()')).rows[0].n,1);
const letter=(await db.query("select hr_letters_admin_save_draft($1,$2,'{\"letter_date\":\"2026-09-28\",\"letterhead_mode\":\"included\"}') id",[employee,code])).rows[0].id;
await db.query('select hr_letters_admin_submit_draft($1)',[letter]);const frozen=(await db.query('select hr_letters_admin_view($1) p',[letter])).rows[0].p;assert.equal(frozen.document.letterhead_mode,'included');assert.equal(frozen.document.values.current_basic,'2300.00');
await db.exec('reset role');await db.exec("update employee_master set final_salary=9999");await assert.rejects(()=>db.query("update hr_letter_templates set body='changed' where code=$1",[code]),/immutable/);
await actor(superuser);await db.query("select hr_letters_admin_decide($1,true,null)",[letter]);await db.query('select hr_letters_admin_issue($1)',[letter]);const issued=(await db.query('select hr_letters_admin_view($1) p',[letter])).rows[0].p;assert.deepEqual(issued.document,frozen.document);
await actor(admin);assert.equal((await db.query("update storage.objects set name='replaced' where bucket_id='hr-letter-sources' returning name")).rows.length,0);assert.equal((await db.query("delete from storage.objects where bucket_id='hr-letter-sources' returning name")).rows.length,0);
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from hr_letter_template_audit')).rows[0].n,2);
const superpath=superuser+'/00000000-0000-4000-8000-000000000021.pdf';await db.query("insert into storage.objects values('hr-letter-sources',$1,$2,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[superpath,superuser]);
await actor(superuser);const next=(await db.query("select hr_letters_register_template('LOC',$1,'test.pdf','pdf','HD','original',true) code",[superpath])).rows[0].code;assert.equal(next,'LOC_TP3');await assert.rejects(()=>db.query('select hr_letters_publish_template($1,true)',[next]),/own template/);await assert.rejects(()=>db.query("select hr_letters_admin_preview($1,$2,'{}')",[next,employee]),/match employee company/);
console.log('PASS: upload ACL/ownership, private/published visibility, TP2 numbering, immutable templates/storage, company validation, authoritative salary, separate publication, frozen document through issue and audit.');
}finally{await db.close();}

