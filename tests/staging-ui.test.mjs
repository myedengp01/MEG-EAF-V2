import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stagingCopy} from './build-staging-ui.mjs';
for(const key of [undefined,'sb_secret_test','sb_publishable_V5o_-Bkz5M7Y75j-eN03rQ_pkQ8Kem9','bad\"key'])assert.throws(()=>stagingCopy('',key),/refused/);
for(const name of ['dashboard.html','hr-letters.html','hr-letters-review.html','eaf-gateway.js']){
 const original=await readFile(new URL('../'+name,import.meta.url),'utf8');
 const copy=stagingCopy(original,'sb_publishable_DUMMY');
 assert(!copy.includes('vzngfswtofegimfcoigx'));
 assert(!copy.includes('sb_publishable_V5o_'));
 assert(!copy.includes('meg_hr_session'));
 assert(copy.includes('fjesgcsumbuniatyaeee'));
 assert(copy.includes('edp_staging_hr_session'));
}
console.log('PASS: staging UI copies isolate endpoints and session storage; production and secret keys refused.');
