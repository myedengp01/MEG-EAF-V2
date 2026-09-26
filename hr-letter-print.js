(function(root){
 'use strict';
 const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function render(text,code,status){
  const brand=root.HRLetterBranding[String(code||'').trim().toUpperCase()];
  if(!brand?.letterhead)throw Error('Company letterhead unavailable.');
  const sheet=element('article');sheet.id='letterPrint';
  const header=element('header',undefined,'letterhead'),image=element('img');image.src=brand.letterhead;image.alt=brand.name+' letterhead';header.append(image);sheet.append(header,element('div',status,'letter-status'));
  const lines=String(text).replaceAll('\r\n','\n').split('\n');let target=sheet,signatory=null,ack=null;
  const finishSignatory=()=>{if(!signatory)return;const wording=signatory.textContent;if(!/(?:^|\n)Name\s*:/i.test(wording))signatory.append(element('p','Name: __________________________________','signatory-field'));if(!/Designation\s*:/i.test(wording))signatory.append(element('p','Designation: _____________________________','signatory-field'));signatory=null;};
  const signatureFields=(signature,date)=>{target.append(element('p',signature,'employee-signature'));target.append(element('p','Name: __________________________________','employee-field'),element('p','NRIC: __________________________________','employee-field'));if(date)target.append(element('p',date,'employee-field'));};
  for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();if(!line){if(target===sheet)sheet.append(element('div',undefined,'section-gap'));continue;}
   if(i===0&&line===line.toUpperCase()&&!/^PRIVATE/.test(line)){
    const title=[line];while(lines[i+1]?.trim()&&lines[i+1].trim()===lines[i+1].trim().toUpperCase()&&!/^PRIVATE|^Date:/i.test(lines[i+1]))title.push(lines[++i].trim());sheet.append(element('h1',title.join(' ')));continue;
   }
   if(/^Yours (faithfully|sincerely)/i.test(line)){signatory=element('section',undefined,'signatory');sheet.append(signatory);target=signatory;}
   if(/^Employee Acknowledg/i.test(line)){finishSignatory();ack=element('section',undefined,'acknowledgement');sheet.append(ack);target=ack;const split=line.indexOf(':');const heading=split<0?line:line.slice(0,split);target.append(element('h2',heading));if(split>=0&&line.slice(split+1).trim()){
     const rest=line.slice(split+1).trim();if(/^Signature:/i.test(rest)){const match=rest.match(/^(Signature:.*?)\s+(Date:.*)$/);signatureFields(match?match[1]:rest,match?.[2]);}else target.append(element('p',rest));
    }continue;}
   if(/^Appendix\b/.test(line)){finishSignatory();target=sheet;ack=null;}
   if(line.includes('|')&&lines[i+1]?.includes('|')){const table=element('table'),thead=element('thead'),tbody=element('tbody');const row=(value,tag)=>{const tr=element('tr');value.split('|').forEach(v=>tr.append(element(tag,v.trim())));return tr;};thead.append(row(line,'th'));while(lines[i+1]?.includes('|'))tbody.append(row(lines[++i],'td'));table.append(thead,tbody);target.append(table);continue;}
   if(ack&&/^(?:Employee )?Signature:/.test(line)){const compact=line.match(/^((?:Employee )?Signature:.*?)\s+(Date:.*)$/);if(compact)signatureFields(compact[1],compact[2]);else target.append(element('p',line,'employee-signature'));continue;}
   if(ack&&/^(Name|NRIC|Date):/.test(line)){target.append(element('p',line,'employee-field'));continue;}
   if(/^Subject:|^Terms and Conditions$/.test(line)){target.append(element('h2',line));continue;}
   const cls=/^Private\s*&\s*Confidential$/i.test(line)?'confidential':/^_+$/.test(line)?'signature-rule':!ack&&!signatory&&/^(Date|Employee Name|Employee ID|Position|Department):/.test(line)?'detail':undefined;
   target.append(element('p',line,cls));
  }
  finishSignatory();return sheet;
 }
 root.HRLetterPrint={render};
})(typeof window!=='undefined'?window:globalThis);
