// Real Supabase HTTP verification. NEVER run against production or real people.
// Credentials stay in process environment; no passwords, tokens or response bodies are logged.
import { pathToFileURL } from 'node:url';
const PRODUCTION_REF='vzngfswtofegimfcoigx';
export function configuration(env) {
  const required=['EDP_STAGING_URL','EDP_STAGING_KEY','EDP_SUPER_TOKEN','EDP_ADMIN_TOKEN','EDP_USER_TOKEN'];
  if(required.some(k=>!env[k])) throw Error('Missing staging configuration; see docs/EDP_STAGING_CHECK.md.');
  const url=new URL(env.EDP_STAGING_URL);
  if(url.protocol!=='https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.hostname===PRODUCTION_REF+'.supabase.co' ||
    url.username || url.password || url.search || url.hash || url.port || url.pathname!=='/') throw Error('Refusing endpoint: a separate Supabase staging project is required.');
  if(env.EDP_STAGING_KEY.startsWith('sb_secret_')) throw Error('Use a publishable key, never a secret/service-role key.');
  if(!env.EDP_STAGING_KEY.startsWith('sb_publishable_')) throw Error('This test requires a Supabase publishable key.');
  return {origin:url.origin,key:env.EDP_STAGING_KEY,superToken:env.EDP_SUPER_TOKEN,adminToken:env.EDP_ADMIN_TOKEN,userToken:env.EDP_USER_TOKEN};
}

export async function verifyStaging(config,fetchImpl=fetch) {
  async function request(path,token,args) {
    const headers={apikey:config.key};
    if(token) headers.Authorization='Bearer '+token;
    if(args!==undefined) headers['Content-Type']='application/json';
    const response=await fetchImpl(config.origin+path,{method:args===undefined?'GET':'POST',headers,
      body:args===undefined?undefined:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(15000)});
    let data; try {data=await response.json();} catch {throw Error('Non-JSON staging response.');}
    return {ok:response.ok,status:response.status,data};
  }
  async function rpc(name,token,args={}) {return request('/rest/v1/rpc/'+name,token,args);}
  function check(value,label) {if(!value) throw Error('Failed staging check: '+label);}
  async function identity(token) {
    const r=await request('/auth/v1/user',token);
    check(r.ok && typeof r.data.id==='string' && /^edp-test-[a-z0-9-]+@example\.invalid$/.test(r.data.email||''),'only dedicated edp-test-…@example.invalid accounts are allowed');
    return r.data.id;
  }
  const superId=await identity(config.superToken),adminId=await identity(config.adminToken),targetId=await identity(config.userToken);
  check(new Set([superId,adminId,targetId]).size===3,'three distinct dummy accounts');
  async function directory() {
    const r=await rpc('eaf_v2_gateway_staff_directory',config.superToken);
    check(r.ok && Array.isArray(r.data),'staff directory'); return r.data;
  }
  const rows=await directory();
  const superUser=rows.find(x=>x.id===superId),admin=rows.find(x=>x.id===adminId),target=rows.find(x=>x.id===targetId);
  check(superUser?.is_super_admin===true && superUser.account_status==='active','active dummy super administrator');
  check(admin?.is_admin===true && !admin.is_super_admin && admin.account_status==='active','active dummy ordinary administrator');
  check(target && !target.is_admin && !target.is_super_admin && target.account_status==='active','active dummy target with no administrator role');
  const flags=u=>JSON.stringify(['can_access_apply','can_access_hr','can_access_jd_manual','can_access_hr_law'].map(k=>u[k]));
  const originalFlags=flags(target);
  async function auditCounts() {
    const r=await rpc('eaf_v2_gateway_get_access_log',config.superToken,{p_limit:500});
    check(r.ok && Array.isArray(r.data),'Access Log available');
    const events=r.data.filter(x=>x.event_code==='administrator_role_change' && x.details?.target_user_id===targetId);
    return ['grant','revoke'].map(action=>events.filter(x=>x.details.action===action &&
      x.details.previous_is_admin===(action==='revoke') && x.details.is_admin===(action==='grant')).length);
  }
  const beforeAudit=await auditCounts();
  const change=(token,id,enabled,expected)=>rpc('eaf_v2_set_administrator',token,{p_user_id:id,p_enabled:enabled,p_expected_is_admin:expected});
  async function denied(promise,label,code='42501') {
    const r=await promise; check(!r.ok && r.data.code===code,label);
  }
  let mutationAttempted=false,success=false,primaryError;
  try {
    await denied(rpc('eaf_v2_gateway_staff_directory',config.userToken),'non-admin directory denial before grant');
    // Negative mutation tests also need cleanup if an authorization regression lets one through.
    mutationAttempted=true;
    await denied(change(null,targetId,true,false),'anonymous denial');
    await denied(change(config.userToken,targetId,true,false),'self-escalation denial');
    await denied(change(config.adminToken,targetId,true,false),'ordinary administrator denial');
    await denied(rpc('eaf_v2_set_staff_permissions',config.adminToken,{p_user_id:targetId,p_changes:{is_admin:true}}),'legacy role assignment denial');
    await denied(change(config.superToken,superId,true,true),'super-administrator self protection');
    // Mark before the request: a network timeout may occur after the database commits.
    mutationAttempted=true;
    const grant=await change(config.superToken,targetId,true,false);
    check(grant.ok && grant.data===true,'grant response');
    const granted=(await directory()).find(x=>x.id===targetId);
    check(granted?.is_admin===true && !granted.is_super_admin && flags(granted)===originalFlags,'grant persisted with app flags preserved');
    // Reuse the original session: authorization must reflect the stored role, not stale JWT claims.
    const targetDirectory=await rpc('eaf_v2_gateway_staff_directory',config.userToken);
    check(targetDirectory.ok && Array.isArray(targetDirectory.data) && targetDirectory.data.some(x=>x.id===targetId && x.is_admin===true),'existing session gains administrator directory access');
    await denied(change(config.userToken,targetId,false,true),'new administrator cannot assign roles');
    await denied(change(config.superToken,targetId,false,false),'stale state rejected','PT409');
    const revoke=await change(config.superToken,targetId,false,true);
    check(revoke.ok && revoke.data===false,'revoke response');
    const restored=(await directory()).find(x=>x.id===targetId);
    check(restored && !restored.is_admin && !restored.is_super_admin && flags(restored)===originalFlags,'revocation persisted with app flags preserved');
    await denied(rpc('eaf_v2_gateway_staff_directory',config.userToken),'existing session loses administrator directory access');
    const afterAudit=await auditCounts();
    check(afterAudit[0]===beforeAudit[0]+1 && afterAudit[1]===beforeAudit[1]+1,'new grant and revoke audit events');
    success=true;
  } catch(e) {primaryError=e;}
  finally {
    if(mutationAttempted) {
      try {
        const current=(await directory()).find(x=>x.id===targetId);
        check(current && !current.is_super_admin,'cleanup target remains ordinary');
        if(current.is_admin) {
          const cleanup=await change(config.superToken,targetId,false,true);
          check(cleanup.ok && cleanup.data===false,'cleanup revocation');
        }
        const final=(await directory()).find(x=>x.id===targetId);
        check(final && !final.is_admin && !final.is_super_admin && flags(final)===originalFlags,'cleanup verified');
      } catch {throw Error('STAGING CLEANUP NOT CONFIRMED: inspect the dedicated dummy target and revoke Administrator before continuing.');}
    }
  }
  if(primaryError) throw primaryError;
  return success;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {await verifyStaging(configuration(process.env));console.log('PASS: staging HTTP role assignment, denials, preserved app flags, audit and verified cleanup.');}
  catch(e) {console.error(e.message);process.exitCode=1;}
}
