(function(root){
 'use strict';
 async function print(text,code,status){
  const brand=root.HRLetterBranding[String(code||'').trim().toUpperCase()];
  if(!brand)throw Error('Company letterhead unavailable.');
  document.getElementById('letterPrint')?.remove();
  const sheet=document.createElement('article');sheet.id='letterPrint';sheet.hidden=true;
  const header=document.createElement('header'),logo=document.createElement('img');logo.src=brand.logo;logo.alt=brand.name;
  header.append(logo);for(const value of [brand.name,brand.regNo,brand.address,[brand.phone,brand.email].join(' · ')]){const p=document.createElement('div');p.textContent=value;header.append(p);}
  const mark=document.createElement('h2');mark.textContent=status;const body=document.createElement('pre');body.textContent=text;
  sheet.append(header,mark,body);document.body.append(sheet);if(logo.decode)await logo.decode();root.print();
 }
 async function share(text){
  if(navigator.share){try{await navigator.share({title:'HR Letter — Private & Confidential',text});}catch(e){if(e.name!=='AbortError')throw e;}return;}
  await navigator.clipboard.writeText(text);root.alert('Letter text copied. Paste it into WhatsApp or your chosen platform after checking the recipient.');
 }
 async function upload(file,detail,headers,rpc){
  const extensions={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
  if(!file||!extensions[file.type]||file.size<=0||file.size>10485760)throw Error('Choose a PDF, JPG or PNG up to 10 MB.');
  if(detail.status!=='issued')throw Error('Signed copies require an issued letter.');
  const path=detail.employee_id+'/'+crypto.randomUUID()+'.'+extensions[file.type];
  const base='https://vzngfswtofegimfcoigx.supabase.co/storage/v1/object/employee-documents/';
  const auth={apikey:headers.apikey,Authorization:headers.Authorization};
  const result=await fetch(base+path,{method:'POST',headers:{...auth,'Content-Type':file.type,'x-upsert':'false'},body:file});
  if(!result.ok)throw Error('Upload denied or unavailable. Existing employee-document permissions are required.');
  try{return await rpc('hr_letters_register_signed_copy',{p_letter:detail.id,p_file_name:file.name,p_storage_path:path,p_mime_type:file.type,p_file_size_bytes:file.size});}
  catch(e){
   // An uncertain registration response may already have committed. Never delete the object here.
   throw Error('File uploaded, but registration could not be confirmed. Ask an administrator to check this path before retrying: '+path);
  }
 }
 root.HRLetterActions={print,share,upload};
})(typeof window!=='undefined'?window:globalThis);
