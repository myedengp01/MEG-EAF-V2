// Builds local test copies only. Does not serve or deploy them.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const production='vzngfswtofegimfcoigx';
const productionKey='sb_publishable_V5o_-Bkz5M7Y75j-eN03rQ_pkQ8Kem9';
export function stagingCopy(source,key){
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||'')||key===productionKey)throw Error('A staging publishable key is required; production and secret keys are refused');
 return source.replaceAll(production,'fjesgcsumbuniatyaeee').replaceAll(productionKey,key).replaceAll('meg_hr_session','edp_staging_hr_session');
}
export async function buildStagingUI(key){
 stagingCopy('',key);
 // Fixed ignored output directory; caller cannot overwrite repository sources.
 const output=new URL('../.staging-ui/',import.meta.url);
 await mkdir(output,{recursive:true});
 for(const name of ['dashboard.html','hr-letters.html','hr-letters-review.html','eaf-gateway.js','admin-roles.js']){
  let source=stagingCopy(await readFile(new URL('../'+name,import.meta.url),'utf8'),key);
  if(name.endsWith('.html'))source=source.replace(/<body([^>]*)>/i,'<body$1><div style="background:#fff3cd;color:#332701;padding:10px;text-align:center">STAGING — disposable test data only</div>');
  if(source.includes(production)||source.includes(productionKey))throw Error('Production configuration remains');
  await writeFile(new URL(name,output),source);
 }
 return resolve(output.pathname);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await buildStagingUI(process.env.EDP_STAGING_KEY);console.log('Staging UI copies written to .staging-ui; no deployment performed.');}
