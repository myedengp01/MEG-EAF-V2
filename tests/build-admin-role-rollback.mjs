// Emits ONE rollback-only SQL batch. Does not connect to any database.
// Existing gateway/profile triggers must be inspected before using on a project.
// PostgreSQL sequence allocations (audit IDs) are not rolled back.
import { readFile } from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20260922115958_eaf_v2_admin_role_assignment.sql',import.meta.url),'utf8');
if ((migration.match(/^begin;\r?$/gm)||[]).length!==1 || (migration.match(/^commit;\r?$/gm)||[]).length!==1) throw Error('Unexpected migration transaction boundaries');
const body=migration.replace(/^begin;\r?$/m,'').replace(/^commit;\r?$/m,'');
const superId='ed000000-0000-4000-8000-000000000001';
const adminId='ed000000-0000-4000-8000-000000000002';
const targetId='ed000000-0000-4000-8000-000000000003';
const ids=`'${superId}','${adminId}','${targetId}'`;
process.stdout.write(`
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$ begin
 if to_regprocedure('public.eaf_v2_set_administrator(uuid,boolean,boolean)') is not null then raise exception 'Refuse: migration already present'; end if;
 if exists(select 1 from auth.users where id in (${ids})) then raise exception 'Refuse: dummy IDs already exist'; end if;
end $$;
create temporary table edp_original_permissions as select user_id,to_jsonb(p) as snapshot from public.eaf_v2_staff_permissions p;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values ('${superId}','edp-super@example.invalid',now(),'{"full_name":"EDP Rollback Super"}'),
('${adminId}','edp-admin@example.invalid',now(),'{"full_name":"EDP Rollback Admin"}'),
('${targetId}','edp-target@example.invalid',now(),'{"full_name":"EDP Rollback Target"}');
-- Existing auth/profile triggers seed the dummy V2 rows. Bootstrap only dummy roles before installing the guard.
update public.eaf_v2_staff_permissions set is_admin=true,is_super_admin=(user_id='${superId}') where user_id in ('${superId}','${adminId}');
update public.eaf_v2_staff_permissions set can_access_hr=true,can_view_summary=true where user_id='${targetId}';
${body}
set local role authenticated;
select set_config('request.jwt.claim.sub','${targetId}',true);
do $$ declare n integer; begin
 begin perform public.eaf_v2_set_administrator('${targetId}',true,false); raise exception 'FAIL: user escalation accepted'; exception when insufficient_privilege then null; end;
 begin
  update public.eaf_v2_staff_permissions set is_admin=true where user_id='${targetId}'; get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: direct update accepted'; end if;
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','${adminId}',true);
do $$ begin
 begin perform public.eaf_v2_set_administrator('${targetId}',true,false); raise exception 'FAIL: ordinary admin granted role'; exception when insufficient_privilege then null; end;
 begin perform public.eaf_v2_set_staff_permissions('${targetId}','{"is_admin":true}'); raise exception 'FAIL: legacy bypass accepted'; exception when insufficient_privilege then null; end;
 perform public.eaf_v2_set_staff_permissions('${targetId}','{"can_view_summary":false}');
 perform public.eaf_v2_gateway_set_user_access('${targetId}','hr',true);
end $$;
select set_config('request.jwt.claim.sub','${superId}',true);
do $$ declare n integer; begin
 begin perform public.eaf_v2_set_administrator('${superId}',false,true); raise exception 'FAIL: own/super role changed'; exception when insufficient_privilege then null; end;
 if public.eaf_v2_set_administrator('${targetId}',true,false) is distinct from true then raise exception 'FAIL: grant'; end if;
 begin perform public.eaf_v2_set_administrator('${targetId}',false,false); raise exception 'FAIL: stale role accepted'; exception when serialization_failure then null; end;
 if not exists(select 1 from public.eaf_v2_staff_permissions where user_id='${targetId}' and is_admin and not is_super_admin and can_access_hr and not can_view_summary) then raise exception 'FAIL: role/permissions'; end if;
 select count(*) into n from public.eaf_v2_gateway_get_access_log(500) where event_code='administrator_role_change' and details->>'target_user_id'='${targetId}' and details->>'action'='grant' and email='edp-super@example.invalid';
 if n<>1 then raise exception 'FAIL: grant audit not visible in existing Access Log reader'; end if;
 if public.eaf_v2_set_administrator('${targetId}',false,true) is distinct from false then raise exception 'FAIL: revoke'; end if;
 select count(*) into n from public.eaf_v2_gateway_get_access_log(500) where event_code='administrator_role_change' and details->>'target_user_id'='${targetId}';
 if n<>2 then raise exception 'FAIL: expected grant and revoke audits'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.eaf_v2_set_administrator('${targetId}',true,false); raise exception 'FAIL: anonymous execute accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from edp_original_permissions b full join (select * from public.eaf_v2_staff_permissions where user_id not in (${ids})) p using(user_id) where b.snapshot is distinct from to_jsonb(p)) then raise exception 'FAIL: original permissions changed'; end if;
 if not exists(select 1 from public.eaf_v2_staff_permissions where user_id='${superId}' and is_admin and is_super_admin) then raise exception 'FAIL: dummy super-admin changed'; end if;
end $$;
rollback;
select 'Rollback completed; all preceding assertions passed' as result,
 to_regprocedure('public.eaf_v2_set_administrator(uuid,boolean,boolean)') is null as migration_absent,
 not exists(select 1 from auth.users where id in (${ids})) as dummy_users_absent,
 not exists(select 1 from public.eaf_v2_staff_permissions where user_id in (${ids})) as dummy_permissions_absent,
 not exists(select 1 from public.eaf_v2_gateway_access_log where user_id in (${ids})) as dummy_audits_absent;
`);
