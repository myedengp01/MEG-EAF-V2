import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}});return elements.get(id);};
const context=vm.createContext({document:{getElementById:el},window:{addEventListener(){}},URLSearchParams,
  location:{search:'',href:''},history:{replaceState(){}},setTimeout:()=>0,clearTimeout(){}});
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
function render(admin,allowed,registered=true){
  context.BOOT={user:{is_admin:admin},apps:{hr:{allowed:true,path:'hr.html'},...(registered?{hr_letters:{allowed,path:'hr-letters.html',mode:'admin_only'}}:{})}};
  context.renderGateway();return el('appCards').innerHTML;
}
assert.match(render(true,true),/href="hr-letters.html"/);
assert.match(el('appCards').innerHTML,/href="hr.html"/);
assert.doesNotMatch(render(true,false),/href="hr-letters.html"/);
assert.doesNotMatch(render(true,true,false),/href="hr-letters.html"/);
assert.doesNotMatch(render(false,true),/href="hr-letters.html"/);
assert.deepEqual(Array.from(context.APP_ORDER),['apply','hr','jd_manual','hr_law']);
context.renderAppsAdmin();assert.doesNotMatch(el('adminBody').innerHTML,/hr_letters/);
for(const [admin,allowed,expected] of [[true,true,'hr-letters.html'],[true,false,''],[false,true,'']]){
  render(admin,allowed);context.location.search='?next=hr_letters';context.location.href='';
  context.handleRequestedApp();assert.equal(context.location.href,expected);
}
const draft=await readFile(new URL('../hr-letters.html',import.meta.url),'utf8');
assert.match(draft,/href="hr-letters-review.html"/);
console.log('PASS: HR Letters card and redirect require administrator plus gateway permission; missing registration fails closed; existing app controls preserved; review link present.');
