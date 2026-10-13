import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8'),db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',normal='00000000-0000-4000-8000-000000000003',employee='00000000-0000-4000-8000-000000000004';
try{
await db.exec(await read('./fixtures/admin-role-baseline.sql'));
await db.exec(`create table employee_master(id uuid primary key,employee_id text,employee_name text,company_code text,department text,approved_job_title text,final_salary numeric);create table jd_entities(code text,name text,is_active boolean);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb);`);
await db.exec((await read('../sql/009_hr_letters_v1_schema.sql')).replace('create extension if not exists pgcrypto;',''));
for(const f of ['013_hr_letters_admin_employee_and_field_metadata.sql','014_hr_letters_admin_preview.sql','015_hr_letters_admin_draft_workflow.sql','016_hr_letters_employee_position_contract_fix.sql','017_hr_letters_distinct_approval.sql','018_hr_letters_issuance_and_immutability.sql'])await db.exec(await read('../sql/'+f));
await db.exec(await read('../supabase/migrations/20260924044224_hr_letters_company_names.sql'));await db.exec(await read('../supabase/migrations/20260927235954_hr_letters_uploaded_templates.sql'));
for(const id of [admin,other,normal]){await db.query('insert into auth.users values($1,now(),null)',[id]);await db.query('insert into eaf_staff_profiles values($1)',[id]);await db.query('insert into eaf_v2_staff_permissions(user_id,is_admin,is_super_admin) values($1,$2,$3)',[id,id!==normal,id===other]);}
await db.query("insert into employee_master values($1,'TEST','Dummy','MEG','Test','Tester',2000)",[employee]);await db.exec("insert into jd_entities values('MEG','Test Co',true);insert into hr_letter_templates(code,title,version,body) values('LOC','Confirmation','v1','Dear {{employee_name}} salary {{current_basic}} increment {{basic_increment}} date {{letter_date}}');");
await db.exec(await read('../supabase/migrations/20261013013149_hr_letters_admin_centre.sql'));
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
const list=async()=>(await db.query('select hr_letters_placeholder_list() p')).rows[0].p;
const save=async(item,expected=null)=>(await db.query("select hr_letters_placeholder_save($1,$2,'Test change') v",[JSON.stringify({label:'Test field',kind:'text',source:'manual',required:true,editable:true,active:true,...item}),expected])).rows[0].v;
const preview=async fields=>(await db.query("select hr_letters_admin_preview('LOC',$1,$2) p",[employee,JSON.stringify(fields)])).rows[0].p;
await actor(normal);await assert.rejects(list,e=>e.code==='42501');await assert.rejects(()=>save({key:'bad'}),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from hr_letter_placeholders'),e=>e.code==='42501');
await actor(admin);assert.equal((await list()).length,4);
const salary=(await list()).find(p=>p.key==='current_basic');await assert.rejects(()=>save({key:'current_basic',source:'manual'},salary.revision),/cannot be changed/);
await assert.rejects(()=>save({key:'private_data',source:'employee',source_key:'bank_account'}),/approved employee/);
await save({key:'staff_name',source:'employee',source_key:'employee_name'});await save({key:'office',source:'default',default_value:'HQ',editable:false});await save({key:'optional_note',required:false});await save({key:'new_total',source:'calculation',source_key:'revised_basic',kind:'money',editable:false});
let p=await preview({_draft_body:'[b]{{staff_name}}[/b] {{office}} {{new_total}} {{optional_note}}',staff_name:'SPOOF',office:'SPOOF',new_total:'1',basic_increment:'100'});assert.equal(p.preview,'[b]Dummy[/b] HQ 2100.00 ');assert.deepEqual(p.missing_fields,[]);
await assert.rejects(()=>preview({_draft_body:'{{unknown}}'}),/Unknown/);await assert.rejects(()=>preview({_draft_body:'[b]unclosed'}),/Close each/);await assert.rejects(()=>preview({_draft_body:'[b][i]bad[/b][/i]'}),/paired/);
const v=(await db.query("select hr_letters_admin_template_save('LOC','v1','Confirmation','[b]Dear {{staff_name}}[/b]','Correction') v")).rows[0].v;
await assert.rejects(()=>db.query("select hr_letters_admin_template_save('LOC','v1','Old','Old body','Race')"),e=>e.code==='40001');
const t=(await db.query("select hr_letters_admin_template_get('LOC') t")).rows[0].t;assert.equal(t.history.length,2);assert.equal(t.version,v);
const staff=(await list()).find(p=>p.key==='staff_name');await assert.rejects(()=>save({...staff,active:false},staff.revision),/used by a template/);
const letter=(await db.query("select hr_letters_admin_save_draft($1,'LOC','{}') id",[employee])).rows[0].id;
let d=(await db.query('select hr_letters_admin_draft_get($1) d',[letter])).rows[0].d;
await actor(other);await db.query("select hr_letters_admin_draft_edit($1,$2,$3,'Draft correction')",[letter,d.updated_at,JSON.stringify({_draft_body:'Hello {{staff_name}}'})]);
d=(await db.query('select hr_letters_admin_draft_get($1) d',[letter])).rows[0].d;assert.equal(d.created_by,other);
await db.query('select hr_letters_admin_submit_draft($1)',[letter]);await assert.rejects(()=>db.query("select hr_letters_admin_decide($1,true,null)",[letter]),/own letter/);
await assert.rejects(()=>db.query("select hr_letters_admin_draft_edit($1,$2,'{}','No')",[letter,d.updated_at]),/Only draft/);
await actor(admin);await save({...staff,label:'New label'},staff.revision);
const frozen=(await db.query('select hr_letters_admin_view($1) p',[letter])).rows[0].p;assert.equal(frozen.text,'Hello Dummy');
const path=admin+'/00000000-0000-4000-8000-000000000099.docx';await db.exec('reset role');await db.query(`insert into storage.objects values('hr-letter-sources',$1,$2,'{"size":100,"mimetype":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}')`,[path,admin]);await actor(admin);
await assert.rejects(()=>db.query("select hr_letters_register_template('LOC',$1,'x.docx','docx','MEG','{{unknown_upload}}',false)",[path]),/Unknown/);
const code=(await db.query("select hr_letters_register_template('LOC',$1,'x.docx','docx','MEG','{{staff_name}}',false) c",[path])).rows[0].c;
const uploaded=(await db.query('select hr_letters_admin_preview($1,$2,$3) p',[code,employee,JSON.stringify({staff_name:'FAKE'})])).rows[0].p;assert.equal(uploaded.document.values.staff_name,'Dummy');
await assert.rejects(()=>db.query('select hr_letters_admin_preview($1,$2,$3)',[code,employee,JSON.stringify({_draft_body:'override'})]),/revised Word/);
console.log('PASS: admin-only registry/editing, protected mappings, authoritative custom fields, defaults/calculations, optional values, unknown tags, formatting validation, history/conflicts, draft ownership/frozen approval and Word upload integration.');
await db.exec('reset role');
await db.exec('create table employee_personal_details(employee_id_ref uuid primary key,correspondence_address text,residential_address text);');
await db.query('insert into employee_personal_details values($1,$2,$3)',[employee,'10 Test Road\nTest Town\n80000 Test State','Old address']);
const native=JSON.parse(await read('./fixtures/hr-letters-before-address.json'));
for(const t of native)await db.query('insert into hr_letter_templates(code,title,version,body) values($1,$2,$3,$4) on conflict(code) do nothing',[t.code,t.title,t.version,t.body]);
await db.exec("insert into hr_letter_placeholders(key,label) select distinct m[1],m[1] from hr_letter_templates cross join lateral regexp_matches(body,'\\{\\{([a-zA-Z0-9_]+)\\}\\}','g') m on conflict(key) do nothing;");
await db.exec(await read('../supabase/migrations/20261013101500_hr_letters_address_and_reference.sql'));
await actor(admin);
const nativeRows=(await db.query('select hr_letters_admin_template_get(\'RL_TP2\') t')).rows[0].t;
assert.equal(nativeRows.uploaded,false);assert.match(nativeRows.body,/{{company_name}}/);assert.doesNotMatch(nativeRows.body,/Lai Fang Yee|MyEden Group|Irene Tan|No\. 79|28 September|three \(3\)|company_namer|AL_taken|leaves_entitlement/);
for(const t of native){const meta=(await db.query('select hr_letters_admin_template_fields($1) m',[t.code])).rows[0].m;assert.ok(meta.fields.includes('address_line1'));assert.ok(meta.fields.includes('letter_date'));assert.equal(meta.uploaded,false);}
const expectedFields=Object.fromEntries([...nativeRows.body.matchAll(/\{\{(\w+)\}\}/g)].map(m=>[m[1],'TEST']));
const newPreview=async f=>(await db.query("select hr_letters_admin_preview('RL_TP2',$1,$2) p",[employee,JSON.stringify(f)])).rows[0].p;
let ap=await newPreview({...expectedFields,_address_override:false});assert.equal(ap.values.address_line1,'10 Test Road\nTest Town\n80000 Test State');assert.equal(ap.values.address_line2,'');assert.equal(ap.missing_fields.length,0);
ap=await newPreview({...expectedFields,_address_override:true,address_line1:'One-letter address'});assert.equal(ap.values.address_line1,'One-letter address');
ap=await newPreview({...expectedFields,address_line1:'Legacy draft address'});assert.equal(ap.values.address_line1,'Legacy draft address');
await db.exec('reset role');assert.equal((await db.query('select correspondence_address a from employee_personal_details')).rows[0].a,'10 Test Road\nTest Town\n80000 Test State');
await db.query("update employee_personal_details set correspondence_address='' where employee_id_ref=$1",[employee]);await actor(admin);assert.equal((await newPreview({_address_override:false})).values.address_line1,'Old address');
await db.exec('reset role');await db.query("update employee_personal_details set residential_address='' where employee_id_ref=$1",[employee]);await actor(admin);ap=await newPreview({_address_override:false});assert.ok(ap.missing_fields.includes('address_line1'));assert.ok(!ap.missing_fields.includes('address_line2'));assert.ok(!ap.missing_fields.includes('postcode_town'));assert.ok(!ap.missing_fields.includes('state'));
for(const company of ['MEG','HD','ABP','MEH']){await db.exec('reset role');if(company!=='MEG')await db.query('insert into jd_entities values($1,$2,true)',[company,'Dummy '+company]);await db.query('update employee_master set company_code=$1 where id=$2',[company,employee]);await actor(admin);assert.equal((await newPreview({...expectedFields,_address_override:true})).company_code,company);}
assert.equal((await db.query('select hr_letters_admin_view($1) p',[letter])).rows[0].p.text,'Hello Dummy');
const nextPath=path.replace('000000000099','000000000098');await db.exec('reset role');await db.query('insert into storage.objects select bucket_id,$1,owner_id,metadata from storage.objects where name=$2',[nextPath,path]);await actor(admin);
const next=(await db.query("select hr_letters_register_template('RL',$1,'x.docx','docx','MEG','{{employee_name}}',false) c",[nextPath])).rows[0].c;assert.equal(next,'RL_TP3');
await actor(normal);await assert.rejects(()=>newPreview({}),e=>e.code==='42501');await assert.rejects(()=>db.query('select hr_letters_private.address_values($1)',[employee]),e=>e.code==='42501');
await actor(admin);
console.log('PASS: 15 standard address blocks; native RL TP2 for four entities; saved/fallback/overridden/legacy/missing addresses; source unchanged; frozen letters; TP3 numbering; non-admin denial.');

}finally{await db.close();}

