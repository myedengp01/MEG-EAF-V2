import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const calls=[];let mode='ok';const c=vm.createContext({crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000003'},fetch:async(url,opts)=>{calls.push({url,opts});return{ok:mode!=='denied'}},navigator:{share:async data=>calls.push(data)}});vm.runInContext(await readFile(new URL('../hr-letter-actions.js',import.meta.url),'utf8'),c);
const f={type:'application/pdf',size:100,name:'signed.pdf'},d={id:'letter',employee_id:'employee',status:'issued'},headers={apikey:'public',Authorization:'Bearer dummy'};
await assert.rejects(()=>c.HRLetterActions.upload({...f,size:10485761},d,headers,()=>{}),/10 MB/);assert.equal(calls.length,0);
await assert.rejects(()=>c.HRLetterActions.upload(f,{...d,status:'draft'},headers,()=>{}),/issued/);assert.equal(calls.length,0);
mode='denied';await assert.rejects(()=>c.HRLetterActions.upload(f,d,headers,()=>assert.fail('registration on denied upload')),/permissions/);
mode='ok';let args;assert.equal(await c.HRLetterActions.upload(f,d,headers,async(n,a)=>{args={n,a};return 'doc'}),'doc');assert.equal(args.n,'hr_letters_register_signed_copy');assert.equal(args.a.p_letter,'letter');assert.equal(calls.at(-1).opts.headers['x-upsert'],'false');
await assert.rejects(()=>c.HRLetterActions.upload(f,d,headers,async()=>{throw Error('uncertain')}),/could not be confirmed/);assert.ok(calls.every(x=>x.opts.method==='POST'),'Never delete a potentially committed document');
await c.HRLetterActions.share('DRAFT');assert.equal(calls.at(-1).text,'DRAFT');console.log('PASS: upload size/type/status guards, storage denial, registration linkage, uncertain response retains file, native share payload.');
