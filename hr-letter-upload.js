(function(root){
 'use strict';
 const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 const mime={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 const tag=/\{\{([a-zA-Z0-9_]+)\}\}/g;
 const parts=/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
 function xml(text){const d=new DOMParser().parseFromString(text,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Invalid Word document XML.');return d;}
 function paragraphs(d){return Array.from(d.getElementsByTagNameNS(WORD,'p'));}
 function runs(p){return Array.from(p.getElementsByTagNameNS(WORD,'t'));}
 // Replace from the end so offsets remain correct, even when Word splits a tag across styled runs.
 function fillParagraph(p,values){const nodes=runs(p),text=nodes.map(n=>n.textContent).join('');
  for(const m of Array.from(text.matchAll(tag)).reverse()){
   let offset=0;const start=m.index,end=start+m[0].length;let inserted=false;
   for(const n of nodes){const s=n.textContent,stop=offset+s.length;if(stop>start&&offset<end){const left=s.slice(0,Math.max(0,start-offset)),right=s.slice(Math.max(0,end-offset));const v=String(values[m[1]]??'').trim();n.textContent=left+(inserted?'':v||'['+m[1].replaceAll('_',' ')+']')+right;n.setAttribute('xml:space','preserve');inserted=true;}offset=stop;}
  }
 }
 async function inspect(bytes,format){
  if(!mime[format]||!bytes.byteLength||bytes.byteLength>10485760)throw Error('Choose a PDF or Word .docx up to 10 MB.');
  if(format==='pdf'){
   const p=await PDFLib.PDFDocument.load(bytes);if(p.getPageCount()>30||p.getForm().getFields().length)throw Error('Use a flattened PDF of up to 30 pages. Password-protected PDFs are not supported.');
   return {body:'Original PDF',fields:[]};
  }
  const zip=await JSZip.loadAsync(bytes);let size=0;const body=[];
  for(const entry of Object.values(zip.files)){
   size+=entry._data?.uncompressedSize||0;if(size>31457280)throw Error('Uncompressed Word document exceeds 30 MB.');
   if(/vbaProject|embeddings\/|afchunk|altchunk/i.test(entry.name))throw Error('Remove macros, embedded files and embedded HTML before uploading.');
   if(entry.name.endsWith('.rels')){const d=xml(await entry.async('string'));if(Array.from(d.getElementsByTagName('Relationship')).some(r=>r.getAttribute('TargetMode')==='External'))throw Error('Remove external links and linked images from the Word file; embed images instead.');}
   if(parts.test(entry.name)){const d=xml(await entry.async('string'));for(const p of paragraphs(d))body.push(runs(p).map(n=>n.textContent).join(''));}
  }
  if(!zip.file('word/document.xml'))throw Error('Use a Word .docx file (not .doc or .docm).');
  const text=body.join('\n');if(!text.trim()||text.length>100000)throw Error('Word document must contain text and be under 100,000 characters.');
  if(text.replace(tag,'').includes('{{')||text.replace(tag,'').includes('}}'))throw Error('Use complete placeholders such as {{employee_name}}. Loops and formulas are not supported.');
  return {body:text,fields:[...new Set(Array.from(text.matchAll(tag),m=>m[1]))]};
 }
 async function wordBytes(bytes,values){const zip=await JSZip.loadAsync(bytes);for(const name of Object.keys(zip.files).filter(n=>parts.test(n))){const d=xml(await zip.file(name).async('string'));paragraphs(d).forEach(p=>fillParagraph(p,values));
  for(const n of Array.from(d.getElementsByTagNameNS(WORD,'t')))if(n.textContent.includes('\n')){const chunks=n.textContent.split(/\r?\n/);for(let i=0;i<chunks.length;i++){if(i)n.parentNode.insertBefore(d.createElementNS(WORD,'w:br'),n);const t=n.cloneNode(false);t.textContent=chunks[i];n.parentNode.insertBefore(t,n);}n.parentNode.removeChild(n);}
  zip.file(name,new XMLSerializer().serializeToString(d));}return zip.generateAsync({type:'uint8array'});}
 const storage='https://vzngfswtofegimfcoigx.supabase.co/storage/v1/object/';
 function auth(headers){return {apikey:headers.apikey,Authorization:headers.Authorization};}
 async function upload(file,user,headers){const format=file.name.split('.').pop().toLowerCase();const bytes=new Uint8Array(await file.arrayBuffer());const details=await inspect(bytes,format);const path=user+'/'+crypto.randomUUID()+'.'+format;
  const r=await fetch(storage+'hr-letter-sources/'+path,{method:'POST',headers:{...auth(headers),'Content-Type':mime[format],'x-upsert':'false'},body:bytes});if(!r.ok)throw Error('Document upload failed ('+r.status+').');return {...details,path,format};
 }
 async function download(meta,headers){const r=await fetch(storage+'authenticated/hr-letter-sources/'+meta.storage_path,{headers:auth(headers),cache:'no-store'});if(!r.ok)throw Error('Cannot load the private source document ('+r.status+').');return new Uint8Array(await r.arrayBuffer());}
 async function headerImage(code){const b=root.HRLetterBranding[code];if(!b)throw Error('Choose a supported company letterhead.');const r=await fetch(b.image||b.letterhead||('assets/letterheads/'+code+'.jpg'));if(!r.ok)throw Error('Company letterhead could not be loaded.');return new Uint8Array(await r.arrayBuffer());}
 async function makePDF(bytes,meta,status){const original=await PDFLib.PDFDocument.load(bytes),pdf=await PDFLib.PDFDocument.create();let header;
  if(meta.letterhead_mode==='company')header=await pdf.embedJpg(await headerImage(meta.letterhead_code));
  for(const [i,source] of original.getPages().entries()){
   const embedded=await pdf.embedPage(source),raw=source.getSize(),rotation=((source.getRotation().angle%360)+360)%360;
   const width=rotation%180?raw.height:raw.width,height=rotation%180?raw.width:raw.height,page=pdf.addPage([width,height]);
   const top=header&&i===0?width*header.height/header.width+30:0;
   const bottom=status==='ISSUED'?0:24,scale=Math.min(1,(height-top-bottom)/height);
   const x=(width-width*scale)/2+(rotation===180?raw.width*scale:rotation===270?raw.height*scale:0);
   const y=bottom+(rotation===90?raw.width*scale:rotation===180?raw.height*scale:0);
   page.drawPage(embedded,{x,y,width:raw.width*scale,height:raw.height*scale,rotate:PDFLib.degrees(-rotation)});
   if(header&&i===0)page.drawImage(header,{x:14,y:height-top+15,width:width-28,height:(width-28)*header.height/header.width});
   if(status!=='ISSUED')page.drawText(status,{x:14,y:8,size:10,color:PDFLib.rgb(.65,0,0)});
  }
  return new Blob([await pdf.save()],{type:mime.pdf});
 }
 async function render(bytes,meta,status){
  await inspect(bytes,meta.format);
  if(meta.format==='pdf'){
   const blob=await makePDF(bytes,meta,status),frame=document.createElement('div');frame.setAttribute('aria-label','Read-only uploaded PDF');
   const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.mjs';
   const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWasm:false,useSystemFonts:true});
   let pdf;try{pdf=await task.promise;let pixels=0;for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),size=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1000/size.width,1500/size.height)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);pixels+=canvas.width*canvas.height;if(pixels>40000000)throw Error('PDF is too large to preview safely. Use a smaller document.');canvas.style.cssText='display:block;width:100%;height:auto;margin-bottom:12px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Letter page '+i+' of '+pdf.numPages);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;frame.append(canvas);
   }}finally{await task.destroy();}
   const url=URL.createObjectURL(blob);return {element:frame,dispose:()=>URL.revokeObjectURL(url),print:()=>{const a=document.createElement('a');a.href=url;a.download='HR-letter-'+status+'.pdf';a.click();},share:async()=>{const f=new File([blob],'HR-letter-'+status+'.pdf',{type:mime.pdf});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'Private HR letter'});else {const a=document.createElement('a');a.href=url;a.download=f.name;a.click();root.alert('PDF saved. Attach it to your chosen platform after checking the recipient.');}}};
  }
  const filled=await wordBytes(bytes,meta.values||{}),container=document.createElement('div');
  await docx.renderAsync(filled,container,container,{useBase64URL:true,renderAltChunks:false,renderComments:false,ignoreLastRenderedPageBreak:false});
  container.querySelectorAll('a').forEach(a=>a.removeAttribute('href'));
  const missing=new Set(Object.entries(meta.values||{}).filter(([,v])=>!String(v??'').trim()).map(([k])=>'['+k.replaceAll('_',' ')+']'));
  const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())texts.push(walker.currentNode);
  for(const n of texts){if(n.parentElement?.closest('style'))continue;const matches=Array.from(n.textContent.matchAll(/\[[a-zA-Z0-9 ]+\]/g)).filter(m=>missing.has(m[0]));if(!matches.length)continue;const frag=document.createDocumentFragment();let start=0;for(const m of matches){frag.append(document.createTextNode(n.textContent.slice(start,m.index)));const mark=document.createElement('mark');mark.textContent=m[0];mark.style.background='#fee2e2';frag.append(mark);start=m.index+m[0].length;}frag.append(document.createTextNode(n.textContent.slice(start)));n.replaceWith(frag);}
  const first=container.querySelector('section.docx');if(first&&meta.letterhead_mode==='company'){const img=document.createElement('img');img.src='data:image/jpeg;base64,'+btoa(Array.from(await headerImage(meta.letterhead_code),b=>String.fromCharCode(b)).join(''));img.style.cssText='width:100%;height:auto;display:block;margin-bottom:12pt';first.prepend(img);}
  if(status!=='ISSUED')for(const section of container.querySelectorAll('section.docx')){const label=document.createElement('p');label.textContent=status;label.style.cssText='font:bold 11pt Arial;color:#a00';section.prepend(label);}
  const frame=document.createElement('iframe');frame.title='Read-only Word letter';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;height:78vh;border:0;background:white';
  const fit=()=>{for(const page of frame.contentDocument?.querySelectorAll('section.docx')||[])page.style.zoom=Math.min(1,(frame.clientWidth-20)/page.offsetWidth);};
  frame.onload=fit;const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(fit):null;observer?.observe(frame);
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:"><style>body{margin:0}.docx-wrapper{padding:8px!important;display:block!important}section.docx{margin-left:0!important;margin-right:0!important}@media print{.docx-wrapper{padding:0!important;background:white!important}section.docx{zoom:1!important;box-shadow:none!important;margin:0!important}}</style></head><body>'+container.innerHTML+'</body></html>';
  return {element:frame,dispose:()=>observer?.disconnect(),print:()=>frame.contentWindow.print(),share:()=>root.HRLetterActions.share((status==='ISSUED'?'':status+'\n')+(meta.text||''))};
 }
 root.HRLetterUpload={mime,inspect,wordBytes,upload,download,render,fillParagraph,makePDF};
})(typeof window!=='undefined'?window:globalThis);
