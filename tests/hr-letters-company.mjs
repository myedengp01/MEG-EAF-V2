import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),read=p=>readFile(new URL(p,import.meta.url),'utf8');
try {
await db.exec(await read('./fixtures/admin-role-baseline.sql'));
await db.exec('create table employee_master(id uuid primary key,employee_id text,employee_name text,company_code text,department text,approved_job_title text,final_salary numeric); create table jd_entities(code text,name text,is_active boolean);');
await db.exec((await read('../sql/009_hr_letters_v1_schema.sql')).replace('create extension if not exists pgcrypto;',''));
for(const f of ['013_hr_letters_admin_employee_and_field_metadata.sql','014_hr_letters_admin_preview.sql','015_hr_letters_admin_draft_workflow.sql','016_hr_letters_employee_position_contract_fix.sql','017_hr_letters_distinct_approval.sql','018_hr_letters_issuance_and_immutability.sql'])await db.exec(await read('../sql/'+f));
const admin='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users values($1,now(),null),($2,now(),null)',[admin,user]);
await db.query('insert into eaf_staff_profiles values($1),($2)',[admin,user]);
await db.query('insert into eaf_v2_staff_permissions(user_id,is_admin) values($1,true),($2,false)',[admin,user]);
const companies=[['MEG','MYEDEN Group Sdn. Bhd.'],['HD','Happy Dino Sdn. Bhd.'],['MEH','MyEden Edu Hub Sdn. Bhd.'],['ABP','Aborne Project Sdn. Bhd.']];
await db.query("insert into employee_master values($1,'DUMMY','Dummy Person','MEG','Test','Test',1234)",[user]);
for(const [code,name] of companies)await db.query('insert into jd_entities values($1,$2,true)',[code,name]);
await db.exec("insert into hr_letter_templates(code,title,version,body) values('LOC','Dummy','test','{{company_name}}: {{employee_name}}'),('LOC_LOI','Dummy combined','test','MYEDEN GROUP SDN. BHD.');");
const migration=await read('../supabase/migrations/20260924044224_hr_letters_company_names.sql');
await db.exec(migration);
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
const preview=()=>db.query("select hr_letters_admin_preview('LOC',$1,'{\"company_name\":\"Spoofed\"}') p",[user]);
const fail=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
for(const [code,name] of companies){
 await db.exec('reset role');await db.query('update employee_master set company_code=$1',[code]);await actor(admin);
 const p=(await preview()).rows[0].p;assert.equal(p.company_name,name);assert.equal(p.preview,name+': Dummy Person');assert.equal(p.company_code,code);
 assert.equal((await db.query('select company_name from hr_letters_admin_employees()')).rows[0].company_name,name);
 if(code!=='MEG')await fail(()=>db.query("select hr_letters_admin_preview('LOC_LOI',$1,'{}')",[user]),'22023');
}
await db.exec('reset role');await db.exec("update employee_master set company_code=' meg '");await actor(admin);
assert.equal((await preview()).rows[0].p.company_name,companies[0][1]);
await db.query("select hr_letters_admin_preview('LOC_LOI',$1,'{}')",[user]);
const letter=(await db.query("select hr_letters_admin_save_draft($1,'LOC','{}') id",[user])).rows[0].id;
await db.query('select hr_letters_admin_submit_draft($1)',[letter]);
await db.exec('reset role');
const frozen=(await db.query('select source_snapshot from hr_letter_records where id=$1',[letter])).rows[0].source_snapshot;
assert.equal(frozen.submitted_preview,companies[0][1]+': Dummy Person');
await db.exec("update jd_entities set name='Renamed Company' where code='MEG'");
assert.deepEqual((await db.query('select source_snapshot from hr_letter_records where id=$1',[letter])).rows[0].source_snapshot,frozen);
for(const setup of ["update employee_master set company_code='UNKNOWN'","update employee_master set company_code='MEG'; update jd_entities set is_active=false where code='MEG'","update jd_entities set is_active=true,name='   ' where code='MEG'","update jd_entities set name='Name' where code='MEG'; insert into jd_entities values(' meg ','Duplicate',true)"]){
 await db.exec('reset role');await db.exec(setup);await actor(admin);await fail(preview,'22023');
 assert.equal((await db.query('select company_name from hr_letters_admin_employees()')).rows[0].company_name,null);
}
await actor(user);await fail(preview,'42501');await fail(()=>db.query('select * from hr_letters_admin_employees()'),'42501');
await db.exec('reset role; set role anon');await fail(preview,'42501');await db.exec('reset role');
const acl=(await db.query("select has_function_privilege('authenticated','hr_letters_private.company_name(text)','EXECUTE') helper,has_function_privilege('anon','public.hr_letters_admin_employees()','EXECUTE') anon")).rows[0];assert.deepEqual(acl,{helper:false,anon:false});
await db.exec(migration);assert.deepEqual((await db.query('select source_snapshot from hr_letter_records where id=$1',[letter])).rows[0].source_snapshot,frozen);
// A distinct dummy super administrator issues the frozen text even after entity drift.
await db.query('update eaf_v2_staff_permissions set is_super_admin=true where user_id=$1',[user]);
await actor(user);
assert.equal((await db.query('select hr_letters_admin_decide($1,true,null) status',[letter])).rows[0].status,'approved');
assert.equal((await db.query('select hr_letters_admin_issue($1) status',[letter])).rows[0].status,'issued');
const issuedView=(await db.query('select hr_letters_admin_view($1) v',[letter])).rows[0].v;
assert.equal(issuedView.text,frozen.submitted_preview);
await db.exec('reset role');
const issued=(await db.query('select * from hr_letter_records where id=$1',[letter])).rows[0];
assert.equal(issued.issued_snapshot.letter_text,frozen.submitted_preview);
const audit=(await db.query('select * from hr_letter_audit where letter_id=$1 order by id',[letter])).rows;
await db.exec("update jd_entities set name='Changed After Issue',is_active=false; update employee_master set employee_name='Changed After Issue'");
await db.exec(migration);
assert.deepEqual((await db.query('select * from hr_letter_records where id=$1',[letter])).rows[0],issued);
assert.deepEqual((await db.query('select * from hr_letter_audit where letter_id=$1 order by id',[letter])).rows,audit);
await fail(()=>db.query("update hr_letter_records set issued_snapshot='{}' where id=$1",[letter]),'42501');
await fail(()=>db.query('delete from hr_letter_records where id=$1',[letter]),'42501');
await actor(admin);
assert.deepEqual((await db.query('select hr_letters_admin_view($1) v',[letter])).rows[0].v,issuedView);
console.log('PASS: distinct-person issuance retains submitted company text; issued record, view and audit survive source changes and migration; update/delete denied.');
console.log('PASS: four company names, normalization, directory/preview consistency, spoof rejection, unknown/inactive/blank/ambiguous denial, MEG-only combined wording, frozen submission and ACLs.');
} finally {await db.close();}
