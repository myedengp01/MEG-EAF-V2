import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Run the actual workspace script with a minimal DOM and deliberately delayed HTTP responses.
const html=await readFile(new URL('../hr-letters.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
  constructor(){this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.children=[];this.dataset={};this.events={};}
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);return child;}
  replaceChildren(...children){this.children=children;}
  get options(){return this.children;}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  async emit(name){await Promise.all((this.events[name]||[]).map(fn=>fn({preventDefault(){}})));}
}
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
const fields=()=>el('fields').children.flatMap(w=>w.children).filter(x=>x.dataset.field);
const pending=[],saved=[];
const response=data=>({ok:true,json:async()=>data});
const context=vm.createContext({document:{getElementById:el,createElement:()=>new Element(),querySelectorAll:fields},
  sessionStorage:{getItem:()=>JSON.stringify({access_token:'dummy-only'})},confirm:()=>true,
  fetch:async(url,options)=>{
    const name=url.split('/').at(-1),args=JSON.parse(options.body);
    if(name==='eaf_v2_gateway_my_access')return response({user:{id:'admin',is_admin:true},apps:{hr_letters:{allowed:true}}});
    if(name==='hr_letters_admin_templates')return response([{code:'LOC',has_body:true},{code:'LOI',has_body:true}]);
    if(name==='hr_letters_admin_employees')return response([{id:'one',employee_name:'Dummy One',company_code:'DUMMY',company_name:'Dummy Full Entity'},{id:'two',employee_name:'Dummy Two',company_code:'UNKNOWN'}]);
    if(name==='hr_letters_admin_template_fields')return response({fields:['custom','company_name'],title:args.p_code,version:1});
    if(name==='hr_letters_admin_list_drafts')return response([]);
    if(name==='hr_letters_admin_preview')return new Promise((resolve,reject)=>pending.push({args,resolve:data=>resolve(response(data)),reject}));
    if(name==='hr_letters_admin_save_draft'){saved.push(args);return response('dummy-draft');}
    throw Error('Unexpected test RPC '+name);
  }});
await vm.runInContext(source,context);
el('employee').value='one';el('template').value='LOC';await el('template').emit('change');
assert.equal(fields().find(f=>f.dataset.field==='company_name').value,'Dummy Full Entity');
assert.equal(fields().find(f=>f.dataset.field==='company_name').disabled,true);
fields()[0].value='Original';await fields()[0].emit('input');
let job=el('letterForm').emit('submit');
assert.equal(pending.at(-1).args.p_fields.custom,'Original');
fields()[0].value='Edited';await fields()[0].emit('input');
pending.at(-1).resolve({preview:'STALE original text',missing_fields:[]});await job;
assert.equal(el('saveButton').disabled,true);
assert.doesNotMatch(el('preview').textContent,/STALE/);
await el('saveButton').emit('click');assert.equal(saved.length,0);

// Returning to the same employee must not resurrect a request from before the change.
job=el('letterForm').emit('submit');
el('employee').value='two';await el('employee').emit('change');
assert.equal(fields().find(f=>f.dataset.field==='company_name').value,'');
el('employee').value='one';await el('employee').emit('change');
pending.at(-1).resolve({preview:'STALE employee response',missing_fields:[]});await job;
assert.equal(el('saveButton').disabled,true);assert.doesNotMatch(el('preview').textContent,/STALE/);

// The same applies to template changes away and back.
job=el('letterForm').emit('submit');
el('template').value='LOI';await el('template').emit('change');
el('template').value='LOC';await el('template').emit('change');
pending.at(-1).resolve({preview:'STALE template response',missing_fields:[]});await job;
assert.equal(el('saveButton').disabled,true);assert.doesNotMatch(el('preview').textContent,/STALE/);

// A late error must not replace the current selection's message.
job=el('letterForm').emit('submit');fields()[0].value='Latest';await fields()[0].emit('input');
pending.at(-1).reject(Error('STALE failure'));await job;
assert.equal(el('missing').textContent,'');assert.equal(el('saveButton').disabled,true);

// A fresh completed preview alone can authorize saving the current fields.
job=el('letterForm').emit('submit');pending.at(-1).resolve({preview:'Latest reviewed text',missing_fields:[]});await job;
assert.equal(el('saveButton').disabled,false);assert.equal(el('preview').textContent,'Latest reviewed text');
await el('saveButton').emit('click');assert.equal(saved.length,1);assert.equal(saved[0].p_fields.custom,'Latest');
assert.equal(el('saveButton').disabled,true);

// Regenerating a valid preview invalidates its previous approval-to-save even on failure.
job=el('letterForm').emit('submit');pending.at(-1).resolve({preview:'Valid text',missing_fields:[]});await job;
assert.equal(el('saveButton').disabled,false);
job=el('letterForm').emit('submit');assert.equal(el('saveButton').disabled,true);
pending.at(-1).reject(Error('Current failure'));await job;
assert.equal(el('saveButton').disabled,true);assert.doesNotMatch(el('preview').textContent,/Valid text/);
assert.match(el('missing').textContent,/Current failure/);
console.log('PASS: delayed previews cannot validate edited fields or restored selections; stale errors ignored; only current reviewed fields can be saved.');
