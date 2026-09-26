import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildStaging} from './build-hr-letters-staging.mjs';
await assert.rejects(()=>buildStaging('vzngfswtofegimfcoigx'),/Only/);
const db=new PGlite();
try {
 await db.exec(await readFile(new URL('./fixtures/admin-role-baseline.sql',import.meta.url),'utf8'));
 await db.exec("create table jd_entities(code text,name text,is_active boolean); insert into jd_entities values('MEG','Dummy Entity',true); create table unrelated(value text); insert into unrelated values('preserve');");
 const before=(await db.query('select * from jd_entities')).rows;
 const sql=(await buildStaging('fjesgcsumbuniatyaeee')).replace('create extension if not exists pgcrypto;','');
 await db.exec(sql);
 assert.deepEqual((await db.query('select * from jd_entities')).rows,before);
 assert.equal((await db.query('select value from unrelated')).rows[0].value,'preserve');
 assert.equal((await db.query('select count(*)::int n from employee_master')).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from hr_letter_templates where not active and length(body)>0")).rows[0].n,15);
 assert.equal((await db.query("select has_table_privilege('authenticated','employee_master','SELECT') allowed")).rows[0].allowed,false);
 await assert.rejects(()=>db.exec(sql),/Refuse to overwrite/);await db.exec('rollback');
 assert.deepEqual((await db.query('select * from jd_entities')).rows,before);
 console.log('PASS: staging-only generation, atomic setup, dummy employee, 15 inactive templates, existing data preservation, denied direct access and overwrite protection.');
} finally {await db.close();}
