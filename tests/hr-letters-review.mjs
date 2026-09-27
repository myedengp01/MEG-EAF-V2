import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
class Element{constructor(){this.children=[];this.textContent='';this.events={};this.open=false;}append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}addEventListener(n,f){this.events[n]=f}showModal(){this.open=true}close(){this.open=false;this.events.close?.()}querySelectorAll(){return this.children}}
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
const rows=['one','two'].map(id=>({id,employee_name:id,employee_number:id,template_code:'LOC',status:'pending_approval',created_by:'creator'}));
const pending=[],mutations=[];let confirmed=false;
const context=vm.createContext({document:{getElementById:el,createElement:()=>new Element()},sessionStorage:{getItem:()=>'{"access_token":"dummy"}'},confirm:()=>confirmed,prompt:()=>null,fetch:async(url,opts)=>{const name=url.split('/').at(-1),args=JSON.parse(opts.body);let value;if(name==='eaf_v2_gateway_my_access')value={user:{id:'reviewer',is_admin:true},apps:{hr_letters:{allowed:true}}};else if(name==='hr_letters_admin_list_drafts')value=rows;else if(name==='hr_letters_admin_view')return new Promise((resolve,reject)=>pending.push({resolve:v=>resolve({ok:true,json:async()=>v}),reject}));else{mutations.push({name,args});value='approved'}return{ok:true,json:async()=>value}}});
const html=await readFile(new URL('../hr-letters-review.html',import.meta.url),'utf8');await vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
const view=i=>el('records').children[i].children.at(-1).children[0].onclick();
let first=view(0);el('close').onclick();let second=view(1);pending[1].resolve({text:'SECOND',status:'pending_approval'});await second;pending[0].resolve({text:'STALE FIRST',status:'pending_approval'});await first;
assert.equal(el('letterText').textContent,'SECOND');assert.equal(el('reviewActions').children.length,2);
await el('reviewActions').children[0].onclick();assert.equal(mutations.length,0);
confirmed=true;await el('reviewActions').children[0].onclick();assert.equal(mutations[0].args.p_letter,'two');assert.equal(el('review').open,false);
first=view(0);el('close').onclick();second=view(1);pending.at(-1).resolve({text:'ISSUED SECOND',status:'issued'});await second;pending.at(-2).reject(Error('STALE ERROR'));await first;
assert.equal(el('reviewMessage').textContent,'');assert.equal(el('reviewActions').children.length,0);
el('close').onclick();first=view(0);el('close').onclick();pending.at(-1).resolve({text:'CLOSED',status:'pending_approval'});await first;assert.equal(el('reviewActions').children.length,0);
console.log('PASS: stale/closed review responses ignored, action targets displayed letter, cancellation sends no mutation, current issued status hides approval actions.');
