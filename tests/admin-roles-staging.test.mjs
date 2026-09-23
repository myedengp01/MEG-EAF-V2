import assert from 'node:assert/strict';
import {configuration,verifyStaging} from './admin-roles-staging.mjs';
const env={EDP_STAGING_URL:'https://edptestproject.supabase.co',EDP_STAGING_KEY:'sb_publishable_test',EDP_SUPER_TOKEN:'super',EDP_ADMIN_TOKEN:'admin',EDP_USER_TOKEN:'user'};
for(const url of ['https://vzngfswtofegimfcoigx.supabase.co','http://edptestproject.supabase.co','https://edptestproject.supabase.co.evil.test','https://secret@edptestproject.supabase.co','https://edptestproject.supabase.co/?token=x']) {
  assert.throws(()=>configuration({...env,EDP_STAGING_URL:url}),/Refusing/);
}
assert.throws(()=>configuration({}),/Missing/);
assert.throws(()=>configuration({...env,EDP_STAGING_KEY:'sb_secret_bad'}),/publishable/);
const config=configuration(env);
function server(options={}) {
  let targetAdmin=false,grantTimedOut=false,everGranted=false; const events=[],calls=[];
  const row=(id,isAdmin,isSuper)=>({id,email:`edp-test-${id}@example.invalid`,is_admin:isAdmin,is_super_admin:isSuper,account_status:'active',can_access_apply:false,can_access_hr:true,can_access_jd_manual:false,can_access_hr_law:false});
  function result(ok,data,status=ok?200:403) {return {ok,status,json:async()=>structuredClone(data)};}
  function audit(enabled) {events.push({event_code:'administrator_role_change',details:{target_user_id:'user',action:enabled?'grant':'revoke',previous_is_admin:!enabled,is_admin:enabled}});}
  async function fetchImpl(url,opts) {
    assert.equal(opts.redirect,'error'); assert.ok(opts.signal);
    const actor=opts.headers.Authorization?.replace('Bearer ','');
    const path=new URL(url).pathname; const args=opts.body?JSON.parse(opts.body):{};
    calls.push({path,actor,args});
    if(path==='/auth/v1/user') return result(true,{id:actor,email:options.realUser && actor==='user'?'someone@company.test':`edp-test-${actor}@example.invalid`});
    if(path.endsWith('eaf_v2_gateway_staff_directory')) {
      if(options.cleanupFails && grantTimedOut) throw Error('Simulated network outage');
      if(actor==='user' && (!targetAdmin || options.staleGrant) && !(options.staleRevoke && everGranted)) return result(false,{code:'42501'});
      return result(true,[row('super',true,true),row('admin',true,false),row('user',targetAdmin,false)]);
    }
    if(path.endsWith('eaf_v2_gateway_get_access_log')) return result(true,events);
    if(path.endsWith('eaf_v2_set_staff_permissions')) {
      if(options.legacyBroken) {targetAdmin=true;audit(true);return result(true,true);}
      return result(false,{code:'42501'});
    }
    if(path.endsWith('eaf_v2_set_administrator')) {
      if(options.missingRPC) return result(false,{code:'PGRST202'},404);
      if(actor!=='super' || args.p_user_id==='super') return result(false,{code:'42501'});
      if(targetAdmin!==args.p_expected_is_admin) return result(false,{code:'PT409'},409);
      targetAdmin=args.p_enabled; audit(targetAdmin);
      if(targetAdmin) everGranted=true;
      if(options.timeoutAfterGrant && targetAdmin && !grantTimedOut) {grantTimedOut=true;throw Error('Simulated timeout after commit');}
      return result(true,targetAdmin);
    }
    throw Error('Unexpected endpoint');
  }
  return {fetchImpl,calls,role:()=>targetAdmin};
}
const good=server(); assert.equal(await verifyStaging(config,good.fetchImpl),true); assert.equal(good.role(),false);
const real=server({realUser:true}); await assert.rejects(()=>verifyStaging(config,real.fetchImpl),/dedicated/);
assert.equal(real.calls.filter(x=>x.path.includes('/rpc/')).length,0);
const timeout=server({timeoutAfterGrant:true}); await assert.rejects(()=>verifyStaging(config,timeout.fetchImpl),/timeout/); assert.equal(timeout.role(),false);
const broken=server({legacyBroken:true}); await assert.rejects(()=>verifyStaging(config,broken.fetchImpl),/legacy role assignment denial/); assert.equal(broken.role(),false);
const missing=server({missingRPC:true}); await assert.rejects(()=>verifyStaging(config,missing.fetchImpl),/anonymous denial/); assert.equal(missing.role(),false);
const lost=server({timeoutAfterGrant:true,cleanupFails:true}); await assert.rejects(()=>verifyStaging(config,lost.fetchImpl),/CLEANUP NOT CONFIRMED/);
const staleGrant=server({staleGrant:true}); await assert.rejects(()=>verifyStaging(config,staleGrant.fetchImpl),/existing session gains/); assert.equal(staleGrant.role(),false);
const staleRevoke=server({staleRevoke:true}); await assert.rejects(()=>verifyStaging(config,staleRevoke.fetchImpl),/existing session loses/); assert.equal(staleRevoke.role(),false);
console.log('PASS: staging harness endpoint/account guards, HTTP contract, new audits, timeout cleanup, authorization-regression cleanup and explicit cleanup failure.');
