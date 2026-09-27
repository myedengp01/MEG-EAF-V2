import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const db=new PGlite();
try {
 await db.exec(await read('./fixtures/admin-role-baseline.sql'));
 await db.exec("alter table auth.users add email text; alter table eaf_staff_profiles add full_name text; insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','dummy@example.invalid'); insert into eaf_staff_profiles(id,full_name) values('00000000-0000-4000-8000-000000000001','Dummy'); insert into eaf_v2_staff_permissions(user_id) values('00000000-0000-4000-8000-000000000001');");
 const sql=await read('./fixtures/staging-gateway-navigation.sql');await db.exec(sql);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); set role authenticated;");
 const access=async()=> (await db.query('select eaf_v2_gateway_my_access() a')).rows[0].a;
 assert.equal((await access()).apps.hr_letters.allowed,false);
 assert.equal((await db.query("select eaf_v2_gateway_log_app_open('hr_letters') ok")).rows[0].ok,false);
 await db.exec('reset role; update eaf_v2_staff_permissions set is_admin=true; set role authenticated;');
 assert.equal((await access()).apps.hr_letters.allowed,true);
 assert.equal((await db.query('select eaf_v2_gateway_log_login() ok')).rows[0].ok,true);
 assert.equal((await db.query("select eaf_v2_gateway_log_app_open('hr_letters') ok")).rows[0].ok,true);
 assert.equal((await db.query("select eaf_v2_gateway_can_access('hr_letters','00000000-0000-4000-8000-000000000002') ok")).rows[0].ok,false);
 await db.exec('reset role; update eaf_v2_staff_permissions set is_admin=false; set role authenticated;');
 assert.equal((await access()).apps.hr_letters.allowed,false);
 await db.exec('reset role; set role anon;');await assert.rejects(access,e=>e.code==='42501');
 await db.exec('reset role;');
 assert.equal((await db.query('select count(*)::int n from eaf_v2_gateway_access_log')).rows[0].n,2);
 await assert.rejects(()=>db.exec(sql),/overwrite/);await db.exec('rollback;');
 console.log('PASS: gateway denies ordinary users, reflects grant/revoke immediately, blocks cross-user/anonymous calls, logs permitted events and refuses overwrite.');
} finally {await db.close();}
