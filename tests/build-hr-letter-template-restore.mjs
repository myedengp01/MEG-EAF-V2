// Emits reviewable SQL only. Never connects to or applies changes to a database.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function buildTemplateRestore(){
  const snapshot=JSON.parse(await readFile(new URL('../templates/hr-letters.snapshot.json',import.meta.url),'utf8'));
  const codes=['DI','EL','LOC','LOC_LOI','LOI','LOP','PEL','PIP','RL','SAL','SCL','TL','TRL','UAL','WL'];
  if(JSON.stringify(snapshot.templates.map(t=>t.code))!==JSON.stringify(codes))throw Error('Expected all 15 unique template codes in canonical order');
  for(const t of snapshot.templates){
    if(t.active!==false || !t.body.trim() || createHash('md5').update(t.body).digest('hex')!==t.body_md5)throw Error('Inactive template content/hash validation failed: '+t.code);
  }
  const literal=value=>"E'"+value.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
  const values=snapshot.templates.map(t=>'('+[t.code,t.title,t.version,t.body].map(literal).join(',')+',false)').join(',\n');
  return `-- REVIEW ONLY: restore captured inactive templates after schema 009, registry 010 and source 011.
-- This is not deployment approval. Does not touch employees, letters, roles or issued snapshots.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
lock table public.hr_letter_templates in share row exclusive mode;
create temporary table edp_template_restore(code text primary key,title text,version text,body text,active boolean) on commit drop;
insert into edp_template_restore values
${values};
do $$ begin
 if exists(select 1 from public.hr_letter_templates t join edp_template_restore s using(code)
   where t.active or (length(btrim(t.body))>0 and (replace(t.body,E'\\r\\n',E'\\n') is distinct from s.body or t.version is distinct from s.version or t.title is distinct from s.title))) then
   raise exception 'Template drift or active template detected; review before restoring';
 end if;
end $$;
insert into public.hr_letter_templates(code,title,version,body,active)
 select code,title,version,body,false from edp_template_restore where true
 on conflict(code) do update set title=excluded.title,version=excluded.version,body=excluded.body,active=false,updated_at=now()
 where not hr_letter_templates.active and hr_letter_templates.body is distinct from excluded.body;
commit;
`;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(await buildTemplateRestore());
