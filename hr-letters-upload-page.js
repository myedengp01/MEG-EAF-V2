(async function(){
 'use strict';const $=id=>document.getElementById(id);let session;
 try{session=JSON.parse(sessionStorage.getItem('meg_hr_session')||'null');}catch{}
 if(!session?.access_token){$('message').textContent='Sign in through the dashboard first.';return;}
 const headers={'Content-Type':'application/json',apikey:'sb_publishable_V5o_-Bkz5M7Y75j-eN03rQ_pkQ8Kem9',Authorization:'Bearer '+session.access_token};
 async function rpc(name,args={}){const r=await fetch('https://vzngfswtofegimfcoigx.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),cache:'no-store'});if(!r.ok){const p=await r.json().catch(()=>({}));throw Error(p.message||'Request failed ('+r.status+').');}return r.json();}
 let user,superAdmin=false,uploads=[],employees=[],current=null,bytes=null,revision=0,timer,busy=false,output=null,complete=false,loading=false;
 const fixed=new Set(['employee_name','employee_id','company_name','department','position','current_position','current_department','current_basic']);
 function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
 function fields(){return [...$('fields').querySelectorAll('[data-field]')];}
 function selectedEmployee(){return employees.find(e=>e.id===$('employee').value);}
 function values(){const v={letterhead_code:$('letterhead').value,letterhead_mode:$('mode').value};for(const i of fields())if(!i.disabled)v[i.dataset.field]=i.value;return v;}
 function buttons(){for(const id of ['employee','mode','letterhead'])$(id).disabled=loading;const ready=!!current&&!!bytes&&!!selectedEmployee()&&!busy&&!loading;$('save').disabled=!ready;$('previewButton').disabled=!ready;$('print').disabled=!ready||!complete;$('share').disabled=!ready||!complete;$('upload').disabled=busy||loading;}
 function invalidate(){revision++;complete=false;output?.dispose();output=null;$('preview').replaceChildren();buttons();clearTimeout(timer);timer=setTimeout(()=>preview(false),450);}
 function master(){const e=selectedEmployee()||{};for(const i of fields())if(fixed.has(i.dataset.field)){const k=i.dataset.field;i.value=String(({...e,current_position:e.position,current_department:e.department,current_basic:e.current_basic==null?'':HRLetterFields.format(e.current_basic)})[k]??'');}}
 function calculate(){const map=Object.fromEntries(fields().map(i=>[i.dataset.field,i]));const c=HRLetterFields.calculate(map.current_basic?.value,map.basic_increment?.value);for(const k of ['basic_increment_pct','revised_basic'])if(map[k])map[k].value=c[k];}
 async function reload(){uploads=await rpc('hr_letters_uploaded_templates');const previous=$('source').value;$('source').replaceChildren(option('','Upload a new letter'));for(const u of uploads)$('source').append(option(u.code,u.code.replace('_TP',' TP')+' — '+u.file_name+' · '+u.company_code+' · '+u.publication));$('source').value=previous;}
 async function select(){const seq=++revision;loading=true;complete=false;bytes=null;current=uploads.find(u=>u.code===$('source').value)||null;output?.dispose();output=null;$('preview').replaceChildren();$('fields').replaceChildren();$('uploadForm').hidden=!!current;$('publication').hidden=true;buttons();
  if(!current){loading=false;buttons();return;}const selected=current;
  $('templateStatus').textContent=selected.code.replace('_TP',' TP')+' · '+selected.company_code+' · '+selected.publication;
  $('publication').hidden=!(superAdmin&&selected.created_by!==user&&selected.publication==='pending');
  try{const [data,source]=await Promise.all([rpc('hr_letters_admin_template_fields',{p_code:selected.code}),HRLetterUpload.download(selected,headers)]);await HRLetterUpload.inspect(source,selected.format);if(seq!==revision)return;bytes=source;
   for(const key of [...new Set([...HRLetterFields.fields(data.fields||[]),...(data.fields||[])])]){const wrap=document.createElement('div'),label=document.createElement('label'),input=document.createElement('textarea');label.htmlFor='field_'+key;label.textContent=key.replaceAll('_',' ')+(fixed.has(key)?' (Employee Master)':'');input.id='field_'+key;input.dataset.field=key;input.maxLength=4000;input.disabled=fixed.has(key);input.addEventListener('input',()=>{if(key==='basic_increment')calculate();invalidate();});input.addEventListener('blur',()=>{if(['basic_increment','basic_increment_pct','revised_basic'].includes(key)){input.value=HRLetterFields.format(input.value);invalidate();}});wrap.append(label,input);$('fields').append(wrap);}
   const previous=$('employee').value;$('employee').replaceChildren(option('','Select employee'));for(const e of employees.filter(e=>e.company_code===selected.company_code))$('employee').append(option(e.id,e.employee_name+' · '+e.employee_id));$('employee').value=previous;$('letterhead').value=selected.company_code;master();$('message').textContent='Letter loaded. Select an employee to preview.';
  }catch(e){if(seq===revision){bytes=null;$('message').textContent=e.message;}}finally{if(seq===revision){loading=false;buttons();invalidate();}}
 }
 async function preview(explicit){clearTimeout(timer);if(!current||!bytes||!selectedEmployee()||busy||loading)return;const seq=++revision;complete=false;buttons();$('previewStatus').textContent='Updating preview…';
  try{const data=await rpc('hr_letters_admin_preview',{p_code:current.code,p_employee:$('employee').value,p_fields:values()});if(seq!==revision)return;
   const missing=data.missing_fields||[];if(explicit&&missing.length&&!confirm('Unfinished fields:\n'+missing.join(', ')+'\n\nContinue preview?'))return;
   const next=await HRLetterUpload.render(bytes,data.document,missing.length?'DRAFT — INCOMPLETE':'DRAFT — NOT ISSUED');if(seq!==revision){next.dispose();return;}
   output?.dispose();output=next;$('preview').replaceChildren(next.element);complete=!missing.length;$('missing').textContent=missing.length?'Unfinished: '+missing.join(', '):'All placeholders filled. Review all original wording and employee details too.';$('previewStatus').textContent='Read-only draft · '+(missing.length?'unfinished fields highlighted':'ready to review');if(explicit)$('layout').dataset.pane='preview';
  }catch(e){if(seq===revision){output?.dispose();output=null;$('preview').replaceChildren();$('previewStatus').textContent=e.message;}}finally{if(seq===revision)buttons();}
 }
 $('source').addEventListener('change',select);$('employee').addEventListener('change',()=>{master();calculate();invalidate();});$('mode').addEventListener('change',invalidate);$('letterhead').addEventListener('change',invalidate);
 $('previewButton').onclick=()=>preview(true);$('formTab').onclick=()=>$('layout').dataset.pane='form';$('previewTab').onclick=()=>$('layout').dataset.pane='preview';
 $('print').onclick=()=>{if(output&&complete)output.print();};$('share').onclick=async()=>{try{if(output&&complete)await output.share();}catch(e){if(e.name!=='AbortError')$('message').textContent=e.message;}};
 $('copyField').onclick=async()=>{try{await navigator.clipboard.writeText('{{'+$('insertField').value+'}}');$('message').textContent='Placeholder copied. Paste it into your Word document.';}catch{$('message').textContent='Copy this placeholder: {{'+$('insertField').value+'}}';}};
 $('upload').onclick=async()=>{const file=$('file').files[0];if(!file||busy)return;if(!confirm('Upload this private document for '+$('company').selectedOptions[0].textContent+'? It will replace standard wording for this letter.'))return;busy=true;buttons();
  try{const data=await HRLetterUpload.upload(file,user,headers);let code;try{code=await rpc('hr_letters_register_template',{p_base:$('base').value,p_path:data.path,p_name:file.name,p_format:data.format,p_company:$('company').value,p_body:data.body,p_reusable:$('reusable').value==='yes'});}catch(e){throw Error('Upload saved, registration not confirmed. Refresh the template list before retrying. Source: '+data.path+'. '+e.message);}
   await reload();$('source').value=code;await select();$('message').textContent=code.replace('_TP',' TP')+' uploaded. '+(data.fields.length?'Automatic fields detected: '+data.fields.join(', '):'No placeholders; original wording retained.');
  }catch(e){$('message').textContent=e.message;}finally{busy=false;buttons();invalidate();}
 };
 $('save').onclick=async()=>{if(busy||!current||!bytes||!selectedEmployee())return;if(!confirm('Save this uploaded letter as an internal draft? No letter will be issued.'))return;busy=true;buttons();try{const id=await rpc('hr_letters_admin_save_draft',{p_employee:$('employee').value,p_code:current.code,p_fields:values()});$('saved').textContent='Draft saved: '+id+'. Open Digital letters → Internal letter records to submit for separate approval.';}catch(e){$('message').textContent=e.message;}finally{busy=false;buttons();}};
 for(const [id,approve] of [['publish',true],['reject',false]])$(id).onclick=async()=>{if(!current||busy)return;if(!confirm((approve?'Publish':'Reject')+' '+current.code.replace('_TP',' TP')+' as a reusable template? Review original wording, company and placeholders first.'))return;busy=true;buttons();try{await rpc('hr_letters_publish_template',{p_code:current.code,p_approve:approve});await reload();await select();}catch(e){$('message').textContent=e.message;}finally{busy=false;buttons();}};
 try{const access=await rpc('eaf_v2_gateway_my_access');if(!access?.user?.is_admin||!access?.apps?.hr_letters?.allowed)throw Error('Administrator access required.');user=access.user.id;const staff=await rpc('eaf_v2_gateway_staff_directory');superAdmin=!!staff.find(s=>s.id===user)?.is_super_admin;
  const [list,people]=await Promise.all([rpc('hr_letters_admin_templates'),rpc('hr_letters_admin_employees')]);employees=people;
  for(const t of list.filter(t=>!/_TP\d+$/.test(t.code)))$('base').append(option(t.code,t.code+' — '+t.title));for(const [code,b] of Object.entries(HRLetterBranding)){for(const id of ['company','letterhead'])$(id).append(option(code,b.name));}
  for(const k of [...new Set([...HRLetterFields.order,'company_name','authorised_signatory','designation'])])$('insertField').append(option(k,k.replaceAll('_',' ')));
  await reload();$('layout').hidden=false;$('message').textContent='Ready for a private Word or PDF upload.';const params=new URLSearchParams(location.search);if(params.get('code')){$('source').value=params.get('code');await select();if(params.get('employee')){$('employee').value=params.get('employee');master();invalidate();}}
 }catch(e){$('message').textContent=e.message;}
})();


