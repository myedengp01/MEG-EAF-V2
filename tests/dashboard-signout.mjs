import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:''});return elements.get(id);};
let resolveFetch,rejectFetch,requests=0,removed=0,alerts=0,timeout;
const context=vm.createContext({document:{getElementById:el},window:{addEventListener(){}},location:{href:''},AbortController,
 sessionStorage:{removeItem(){removed++;}},alert(){alerts++;},setTimeout(fn){timeout=fn;return 1;},clearTimeout(){},
 fetch(url,options){requests++;assert.match(url,/\/auth\/v1\/logout$/);assert.equal(options.headers.Authorization,'Bearer dummy');return new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;options.signal.addEventListener('abort',()=>reject(Error('aborted')));});}});
for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
const reset=()=>{context.SESSION={access_token:'dummy'};context.BOOT={};context.location.href='';};
reset();let pending=context.signOutDashboard();await context.signOutDashboard();assert.equal(requests,1);assert.equal(removed,0);assert.equal(context.location.href,'');assert(el('signOutBtn').disabled);
resolveFetch({ok:true});await pending;assert.equal(removed,1);assert.equal(context.SESSION,null);assert.equal(context.location.href,'dashboard.html');
for(const failure of ['http','network','timeout']){reset();pending=context.signOutDashboard();if(failure==='http')resolveFetch({ok:false});else if(failure==='network')rejectFetch(Error('offline'));else timeout();await pending;assert.equal(context.location.href,'');assert.equal(context.SESSION.access_token,'dummy');assert(!el('signOutBtn').disabled);}
assert.equal(alerts,3);assert.equal(removed,1);
pending=context.signOutDashboard();resolveFetch({ok:true});await pending;assert.equal(removed,2);
context.SESSION=null;context.location.href='';await context.signOutDashboard();assert.equal(context.location.href,'dashboard.html');
console.log('PASS: logout waits for acknowledgement, blocks duplicate clicks, retains retry on HTTP/network/timeout failure, and clears session only on success.');
