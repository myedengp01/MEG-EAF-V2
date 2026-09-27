import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../admin-roles.js',import.meta.url),'utf8');
const rows=[
  {id:'super',full_name:'Test Super',email:'super@example.invalid',is_admin:true,is_super_admin:true,account_status:'active'},
  {id:'admin',full_name:'Test Admin',email:'admin@example.invalid',is_admin:true,is_super_admin:false,account_status:'active'},
  {id:'user',full_name:'<img src=x>',email:'user@example.invalid',is_admin:false,is_super_admin:false,account_status:'active'},
  {id:'pending',email:'pending@example.invalid',is_admin:false,is_super_admin:false,account_status:'pending'}
];
const body={innerHTML:'',querySelectorAll:()=>[]}, calls=[],messages=[];
let confirmed=false,fail=false;
const context=vm.createContext({BOOT:{user:{id:'super'}},CURRENT_ADMIN_TAB:'users',
  document:{getElementById:()=>body,querySelectorAll:()=>[]},
  esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),
  accessCheck:()=>'<input type="checkbox">',confirm:m=>{messages.push(m);return confirmed;},
  alert:m=>messages.push(m),showToast:m=>messages.push(m),
  rpc:async(name,args)=>{calls.push({name,args});if(name.includes('directory'))return structuredClone(rows);if(fail)throw Error('Denied');return args.p_enabled;}
});
vm.runInContext(source,context);
await context.renderUsersAdmin();
assert.match(body.innerHTML,/Super Administrator — Protected/);
assert.match(body.innerHTML,/&lt;img src=x&gt;/);
assert.equal((body.innerHTML.match(/data-admin-role=/g)||[]).length,3);
assert.match(body.innerHTML,/data-admin-role="3" disabled/);
await context.changeAdministrator(2);
assert.equal(calls.filter(c=>c.name==='eaf_v2_set_administrator').length,0);
assert.match(messages[0],/user@example.invalid/);
confirmed=true;
await context.changeAdministrator(2);
assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c=>c.name==='eaf_v2_set_administrator').args)),{p_user_id:'user',p_enabled:true,p_expected_is_admin:false});
assert.match(messages.at(-1),/Audit recorded/);
await context.changeAdministrator(1);
assert.equal(calls.filter(c=>c.name==='eaf_v2_set_administrator').at(-1).args.p_enabled,false);
const n=calls.length;
await context.changeAdministrator(0); await context.changeAdministrator(3);
assert.equal(calls.length,n);
fail=true; await context.changeAdministrator(2);
assert.match(messages.at(-1),/Could not confirm administrator change/);
assert.equal(context.ADMIN_ROLE_BUSY,false);
context.BOOT.user.id='admin'; await context.renderUsersAdmin();
assert.doesNotMatch(body.innerHTML,/data-admin-role=/);
const before=calls.length; await context.changeAdministrator(2); assert.equal(calls.length,before);
context.CURRENT_ADMIN_TAB='apps'; body.innerHTML='Apps'; await context.renderUsersAdmin();
assert.doesNotMatch(body.innerHTML,/data-admin-role=/);
console.log('PASS: UI visibility, escaping, confirmation/cancel, grant/revoke payloads, protected accounts, failure refresh and tab guard.');
