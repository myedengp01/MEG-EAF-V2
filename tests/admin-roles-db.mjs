import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Pass a file URL for an externally installed, pinned PGlite module.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
await db.exec(await read('./fixtures/admin-role-baseline.sql'));
const ids = Array.from({length: 7}, (_, i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [superId, adminId, userId, targetId, bannedId, pendingId, missingProfileId] = ids;
for (const id of ids) {
  await db.query('insert into auth.users values($1,now(),null)',[id]);
  if(id!==missingProfileId) await db.query('insert into eaf_staff_profiles values($1)',[id]);
  if(id!==missingProfileId && id!==pendingId) await db.query('insert into eaf_v2_staff_permissions(user_id,is_admin,is_super_admin,can_access_hr,can_view_summary) values($1,$2,$3,true,true)',[id,id===superId||id===adminId,id===superId]);
}
await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[bannedId]);
await db.query('update auth.users set email_confirmed_at=null where id=$1',[pendingId]);
const snapshot = async id => (await db.query("select to_jsonb(p)-'updated_at'-'updated_by'-'is_admin' as value from eaf_v2_staff_permissions p where user_id=$1",[id])).rows[0].value;
const before = await snapshot(targetId), superBefore = await snapshot(superId);
await db.exec(await read('../supabase/migrations/20260922115958_eaf_v2_admin_role_assignment.sql'));
let checks=0;
async function actor(id, role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
  await db.exec(`set role ${role}`);
}
const assign = (id,enabled,expected) => db.query('select public.eaf_v2_set_administrator($1,$2,$3) as value',[id,enabled,expected]);
async function denied(fn,code) { await assert.rejects(fn,e=>e.code===code); checks++; }
await actor(null,'anon'); await denied(()=>assign(targetId,true,false),'42501');
await actor(null); await denied(()=>assign(targetId,true,false),'42501');
await actor(userId); await denied(()=>assign(userId,true,false),'42501');
await actor(adminId); await denied(()=>assign(targetId,true,false),'42501');
await denied(()=>db.query("select eaf_v2_set_staff_permissions($1,'{\"is_admin\":true}')",[targetId]),'42501');
await denied(()=>db.query("select eaf_v2_set_staff_permissions($1,'{\"is_super_admin\":true}')",[adminId]),'P0001');
await actor(superId);
await denied(()=>assign(superId,false,true),'42501');
await denied(()=>assign(targetId,null,false),'22023');
await denied(()=>assign(missingProfileId,true,false),'22023');
await denied(()=>assign(bannedId,true,false),'22023');
await denied(()=>assign(pendingId,true,false),'22023');
assert.equal((await assign(targetId,true,false)).rows[0].value,true); checks++;
await denied(()=>assign(targetId,false,false),'PT409');
await db.exec('reset role');
assert.deepEqual(await snapshot(targetId),before); checks++;
let audit=(await db.query("select * from eaf_v2_gateway_access_log where event_code='administrator_role_change'")).rows;
assert.equal(audit.length,1); assert.equal(audit[0].user_id,superId);
assert.deepEqual(audit[0].details,{target_user_id:targetId,previous_is_admin:false,is_admin:true,action:'grant'}); checks++;
await actor(superId); await assign(targetId,true,true);
await assign(targetId,false,true); checks++;
// Old RPC remains usable for existing ordinary permissions, but role changes are guarded/audited.
await actor(adminId);
await db.query("select eaf_v2_set_staff_permissions($1,'{\"can_view_summary\":false}')",[targetId]); checks++;
await db.query("select eaf_v2_gateway_set_user_access($1,'hr',false)",[targetId]); checks++;
await actor(superId);
await db.query("select eaf_v2_set_staff_permissions($1,'{\"is_admin\":true}')",[targetId]); checks++;
await db.exec('reset role');
await denied(()=>db.query('update eaf_v2_staff_permissions set is_super_admin=true where user_id=$1',[targetId]),'42501');
await denied(()=>db.query('delete from eaf_v2_staff_permissions where user_id=$1',[superId]),'42501');
await denied(()=>db.query('update eaf_v2_staff_permissions set user_id=$1 where user_id=$2',[missingProfileId,targetId]),'42501');
assert.deepEqual(await snapshot(superId),superBefore); checks++;
audit=(await db.query("select * from eaf_v2_gateway_access_log where event_code='administrator_role_change'")).rows;
assert.equal(audit.length,3); checks++;
// Audit failure must roll back the role update.
await db.exec("create function public.test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$; create trigger test_reject_audit before insert on eaf_v2_gateway_access_log for each row execute function public.test_reject_audit();");
await actor(superId); await denied(()=>assign(targetId,false,true),'P0001');
await db.exec('reset role');
assert.equal((await db.query('select is_admin from eaf_v2_staff_permissions where user_id=$1',[targetId])).rows[0].is_admin,true); checks++;
await db.exec('drop trigger test_reject_audit on eaf_v2_gateway_access_log');
// Missing permission rows are safely seeded for existing active staff only.
await db.query('update auth.users set email_confirmed_at=now() where id=$1',[pendingId]);
await actor(superId); await assign(pendingId,true,false); checks++;
// RLS denies direct browser writes even to the caller's own permission row.
await actor(userId);
assert.equal((await db.query('update eaf_v2_staff_permissions set is_admin=true where user_id=$1 returning user_id',[userId])).rows.length,0); checks++;
await denied(()=>db.query('insert into eaf_v2_staff_permissions(user_id,is_super_admin) values($1,true)',[missingProfileId]),'42501');
await db.exec('reset role');
const acl=(await db.query("select has_function_privilege('anon','public.eaf_v2_set_administrator(uuid,boolean,boolean)','EXECUTE') as anon,has_function_privilege('authenticated','public.eaf_v2_set_administrator(uuid,boolean,boolean)','EXECUTE') as authenticated")).rows[0];
assert.deepEqual(acl,{anon:false,authenticated:true}); checks++;
// Exercise the existing HR Letters workflow with an entirely dummy employee/template.
await db.exec('create table public.employee_master(id uuid primary key,employee_id text,employee_name text,company_code text,department text,approved_job_title text,final_salary numeric);');
await db.exec((await read('../sql/009_hr_letters_v1_schema.sql')).replace('create extension if not exists pgcrypto;',''));
for (const file of ['014_hr_letters_admin_preview.sql','015_hr_letters_admin_draft_workflow.sql','017_hr_letters_distinct_approval.sql','018_hr_letters_issuance_and_immutability.sql']) await db.exec(await read('../sql/'+file));
await db.query("insert into employee_master values($1,'DUMMY','Dummy Employee','TEST','Test','Test',0)",[userId]);
await db.exec("insert into hr_letter_templates(code,title,version,body) values('RL','Dummy test only','test','Dummy letter: no real employee data');");
await actor(targetId);
const letter=(await db.query("select hr_letters_admin_save_draft($1,'RL','{}') as id",[userId])).rows[0].id;
assert.equal((await db.query('select hr_letters_admin_submit_draft($1) as status',[letter])).rows[0].status,'pending_approval'); checks++;
await denied(()=>db.query('select hr_letters_admin_decide($1,true,null)',[letter]),'42501');
await denied(()=>db.query('select hr_letters_admin_issue($1)',[letter]),'42501');
await actor(superId);
assert.equal((await db.query('select hr_letters_admin_decide($1,true,null) as status',[letter])).rows[0].status,'approved'); checks++;
assert.equal((await db.query('select hr_letters_admin_issue($1) as status',[letter])).rows[0].status,'issued'); checks++;
const own=(await db.query("select hr_letters_admin_save_draft($1,'RL','{}') as id",[userId])).rows[0].id;
await db.query('select hr_letters_admin_submit_draft($1)',[own]);
await denied(()=>db.query('select hr_letters_admin_decide($1,true,null)',[own]),'42501');
await assign(targetId,false,true);
await actor(targetId); await denied(()=>db.query("select hr_letters_admin_save_draft($1,'RL','{}')",[userId]),'42501');
await db.exec('reset role');
await denied(()=>db.query("update hr_letter_records set fields='{}' where id=$1",[letter]),'42501');
await db.close();
console.log(`PASS: ${checks} database checks; isolated dummy users only.`);
