/*
 * MEG-EAF V2 HR Extension
 * - multi-entity HR dashboard filtering
 * - JD database as preferred source of truth
 * - entity-aware combined Letter of Offer & Employment Contract (LOEC)
 * - configurable probation/remuneration/OT category
 * - manual wet-ink signing record + signed PDF upload + stamp tracking
 * - Build 09 payroll View Only can read/print LOEC and stored signed PDFs without mutation rights
 * - Build 10 V1/V2 permission separation; V2 uses eaf_v2_staff_permissions
 * - Build 11 entity -> general JT -> exact level -> JD reference cascade; strict legal-employer JD filtering
 * - Build 12 Appendix 1 pagination fix; long JD responsibility lists flow naturally across pages
 * - Build 14 entity-aware Working Hours wording in LOEC salient terms
 * - Build 15 dedicated Happy Dino and Aborne Project LOEC operational clauses
 * - Build 16 hourly pay basis, split working sessions, schedule footnote and manual Appendices 2-4
 *
 * Requires optional Supabase migration in supabase/migrations/001_meg_eaf_v2_loec.sql
 * Existing V1 records continue to work without the migration; the V2 LOEC record panel
 * simply reports that setup is pending.
 */
(function(){
'use strict';

window.MEG_EAF_V2 = window.MEG_EAF_V2 || {};
var V2=window.MEG_EAF_V2;
V2.version='MEG-EAF-HR V2 v2026.09.02-15:45';
V2.jd=null;
V2.pendingRestore=null;
V2.loecRecord=null;
V2.loecRecordAvailable=true;
V2.companyFilter='';

var ENTITY_PROFILES={
  meg:{prefix:'MEG',handbook:'MyEden Group Employee Handbook v2.0',defaultProbation:3,defaultProbationNotice:4,defaultProbationNoticeUnit:'weeks',offDay:'Saturday',restDay:'Sunday',eventDriven:false,workLocationText:'Company premises and other assigned locations as reasonably required.'},
  meh:{prefix:'MEH',handbook:'MyEden Group Employee Handbook v2.0',defaultProbation:3,defaultProbationNotice:4,defaultProbationNoticeUnit:'weeks',offDay:'Saturday',restDay:'Sunday',eventDriven:false,workLocationText:'Company premises and other assigned locations as reasonably required.'},
  hds:{prefix:'HDS',handbook:'Happy Dino Employee Handbook & Child-Safe Event Code v1.0',defaultProbation:'',defaultProbationNotice:'',defaultProbationNoticeUnit:'weeks',offDay:'Saturday',restDay:'Sunday',eventDriven:true,workLocationText:'Company office, schools, client premises, event venues and other assigned programme locations as reasonably required.'},
  abn:{prefix:'ABP',handbook:'Aborne Project Employee Handbook & Event Professional Code v1.0',defaultProbation:'',defaultProbationNotice:'',defaultProbationNoticeUnit:'weeks',offDay:'Saturday',restDay:'Sunday',eventDriven:true,workLocationText:'Company office, client premises, event venues and other assigned project locations as reasonably required.'}
};
var COMPANY_ALIASES={
  meg:['MyEden Group Sdn. Bhd.','MYEDEN Group Sdn. Bhd.','Myeden Group Sdn Bhd'],
  meh:['MyEden Edu Hub Sdn. Bhd.','MYEDEN Edu Hub Sdn. Bhd.'],
  hds:['Happy Dino Sdn. Bhd.','HAPPY DINO SDN. BHD.'],
  abn:['Aborne Project Sdn. Bhd.','ABORNE PROJECT SDN. BHD.']
};

function e2(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function companyCode(){return (document.getElementById('companySelect')||{}).value||'meg';}
function companies(){return (typeof EAF_COMPANIES!=='undefined' && EAF_COMPANIES) ? EAF_COMPANIES : (window.EAF_COMPANIES||{});}
function profile(){return ENTITY_PROFILES[companyCode()]||ENTITY_PROFILES.meg;}
function companyObj(){return companies()[companyCode()]||{};}
function workingHoursSalientText(d){
  var code=(d&&d.companyCode)||companyCode();
  var base='From '+e2((d&&d.timeFrom)||'')+' to '+e2((d&&d.timeTo)||'');
  if(code==='hds') return base+', subject to lawful school programme, camp or event scheduling where applicable';
  if(code==='abn') return base+', subject to lawful event or project scheduling where applicable';
  return base;
}
function byId(id){return document.getElementById(id);}
function fmtMoney(v){var n=parseFloat(v||0);return isFinite(n)?'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}):'RM 0.00';}
function findEntityId(code){
  if(!V2.jd) return null;
  var aliases=(COMPANY_ALIASES[code]||[]).map(norm);
  var x=(V2.jd.entities||[]).find(function(e){return aliases.indexOf(norm(e.name))>=0;});
  return x?x.id:null;
}
function deptName(id){var x=V2.jd&&(V2.jd.departments||[]).find(function(d){return d.id===id;});return x?x.name:'';}


var LEGACY_POST_ALIASES={
  'childcare mentor':'Childcare (Ages 7-18)',
  'kindergarten teacher':'Kindergarten (Ages 4-6)',
  'infant childcare':'Infant Childcare (Ages 0-2)',
  'playgroup mentor':'Playgroup (Ages 2-4)',
  'management':'Management','hr':'Human Resources','human resources':'Human Resources',
  'admin':'Administration','administration':'Administration',
  'account':'Accounts','accounts':'Accounts',
  'account & payroll':'Accounts & Payroll','accounts & payroll':'Accounts & Payroll',
  'content creator':'Content Creation','content creation':'Content Creation',
  'marketing':'Marketing & Brand','marketing & brand':'Marketing & Brand',
  'finance':'Finance','events':'Events','sales':'Sales'
};
function cleanPostName(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');}
function familyBucket(name){var n=cleanPostName(name);return /(childcare|infant|kindergarten|playgroup|camp|operations|logistics|event|programme|program)/.test(n)?'operations':'office';}
function familyHeading(bucket){return bucket==='operations'?'A. Operations':'B. Office';}
function uniqueText(parts){var seen={};return (parts||[]).map(function(x){return String(x||'').trim();}).filter(function(x){var k=cleanPostName(x);if(!k||seen[k])return false;seen[k]=1;return true;});}
function canonicalLegacyFamily(value,families){
  var raw=String(value||'').trim();if(!raw)return null;
  var direct=(families||[]).find(function(d){return cleanPostName(d.name)===cleanPostName(raw);});if(direct)return direct;
  var alias=LEGACY_POST_ALIASES[cleanPostName(raw)]||'';
  if(alias){var a=(families||[]).find(function(d){return cleanPostName(d.name)===cleanPostName(alias);});if(a)return a;}
  return null;
}

function addV2Styles(){
  var st=document.createElement('style');
  st.textContent='\n.v2-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:#eef5fc;color:#1565c0;font-size:10px;font-weight:700}.v2-panel{border:1.5px solid #90caf9;background:#f7fbff;border-radius:7px;padding:12px;margin:12px 0}.v2-panel h4{margin:0 0 8px;color:#0d47a1}.v2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.v2-grid .form-group{min-width:0}.v2-status{font-weight:800;padding:4px 8px;border-radius:5px;background:#eceff1}.v2-warn{padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:5px;color:#6d4c41;font-size:11px}.v2-ok{padding:8px 10px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:5px;color:#1b5e20;font-size:11px}.v2-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.v2-actions button{border:0;border-radius:5px;padding:7px 10px;color:#fff;background:#1565c0;cursor:pointer}.v2-actions button.secondary{background:#546e7a}.v2-actions button.good{background:#2e7d32}.v2-actions button.warn{background:#ef6c00}.v2-actions button.danger{background:#c62828}.b16-app-card{border:1px solid #d4e2ef;border-radius:6px;background:#fff;margin:8px 0;padding:10px}.b16-app-enable{font-weight:800;color:#174a7a;display:flex;align-items:center;gap:7px;cursor:pointer}.b16-app-body{margin-top:9px}.b16-table-toggle{display:flex;align-items:center;gap:6px;margin:8px 0;font-size:12px;font-weight:700}.b16-table-tools{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.b16-table-tools button{font-size:11px;padding:4px 8px;border:1px solid #8aa6bf;background:#f5f9fc;border-radius:4px;cursor:pointer}.b16-table-host{overflow:auto}.b16-edit-table{min-width:560px}.b16-edit-table th,.b16-edit-table td{padding:3px}.b16-edit-table th input{font-weight:700}.b16-edit-table textarea{width:100%;min-height:46px;border:0;resize:vertical;padding:4px;font:inherit}.b16-contract-table th,.b16-contract-table td{text-align:left!important;vertical-align:top!important}.rec-code{color:#173b2a!important;font-weight:800!important;background:#eef8f0!important}@media(max-width:700px){.v2-grid{grid-template-columns:1fr}}\n';
  document.head.appendChild(st);
}

function installDashboardCompanyFilter(){
  if(byId('v2CompanyFilter')) return;
  var search=byId('dashSearch'); if(!search) return;
  var sel=document.createElement('select');
  sel.id='v2CompanyFilter'; sel.className='dash-search'; sel.style.maxWidth='320px'; sel.style.marginTop='0';
  sel.innerHTML='<option value="">All Companies</option>'+
    Object.keys(companies()).map(function(k){return '<option value="'+k+'">'+e2(companies()[k].name)+'</option>';}).join('');
  sel.onchange=function(){V2.companyFilter=this.value;renderLists();};
  search.parentNode.insertBefore(sel,search.nextSibling);
}

var oldLoadApps=window.loadApps;
window.loadApps=function(){
  var el=byId('appList'); if(el) el.innerHTML='<div class="empty-note">Loading...</div>';
  return apiFetch('/rest/v1/eaf_applications?select=id,applicant_name,position_applied,status,submitted_at,payload&order=submitted_at.desc')
    .then(function(rows){appsCache=rows||[];renderLists();})
    .catch(function(err){if(el)el.innerHTML='<div class="empty-note">Could not load applications: '+e2(err.message)+'</div>';});
};

var oldRenderLists=window.renderLists;
window.renderLists=function(){
  var original=appsCache;
  if(V2.companyFilter){
    appsCache=(original||[]).filter(function(r){return ((r.payload||{}).companyCode||'meg')===V2.companyFilter;});
  }
  oldRenderLists();
  var visible=appsCache||[];
  var q=(byId('dashSearch')&&byId('dashSearch').value||'').toLowerCase();
  var rows=visible.filter(function(r){return !q||(r.applicant_name||'').toLowerCase().indexOf(q)>-1;});
  var cards=Array.prototype.slice.call(document.querySelectorAll('#appList .rec-card'));
  cards.forEach(function(card,i){
    var r=rows[i]; if(!r)return; var code=((r.payload||{}).companyCode||'meg'); var c=companies()[code];
    var sub=card.querySelector('.rec-sub'); if(sub&&c) sub.innerHTML='<span class="v2-chip">'+e2(c.name.replace(' Sdn. Bhd.',''))+'</span> &nbsp;'+sub.innerHTML;
  });
  appsCache=original;
};

function ensureSummaryCompanyColumn(){
  var tr=document.querySelector('#summaryTable thead tr'); if(!tr||tr.querySelector('[data-v2-company]'))return;
  var th=document.createElement('th'); th.setAttribute('data-v2-company','1'); th.style.cssText='border:1px solid #ccc;padding:5px 8px;text-align:left;'; th.textContent='Legal Employer';
  var first=tr.children[0]; if(first&&first.nextSibling)tr.insertBefore(th,first.nextSibling);else tr.appendChild(th);
}

function summaryFinalJobTitle(p){
  var direct=summaryField(p,'v2ResolvedJobTitle');if(direct)return direct;
  var level=summaryField(p,'jobTitleLevel');if(level&&level.indexOf('|')>=0){var parts=level.split('|');if(parts.length>1&&parts.slice(1).join('|').trim())return parts.slice(1).join('|').trim();}
  var av=summaryField(p,'approvedJobTitle');
  if(av.indexOf('jd:')===0&&V2.jd){var jp=exactJdById(av.slice(3));if(jp)return jp.job_title||av;}
  return summaryField(p,'v2ApprovedFamilyName')||av;
}
window.loadSummary=function(){
  ensureSummaryCompanyColumn();
  var tbody=byId('summaryTbody');
  tbody.innerHTML='<tr><td colspan="17" style="padding:10px;color:#777;">Loading...</td></tr>';
  apiFetch('/rest/v1/eaf_applications?select=id,status,payload,submitted_at&order=submitted_at.desc').then(function(rows){
    if(!rows||!rows.length){tbody.innerHTML='<tr><td colspan="17" style="padding:10px;color:#777;">No applications yet.</td></tr>';return;}
    tbody.innerHTML=rows.map(function(r){var p=r.payload||{},code=p.companyCode||'meg',c=companies()[code]||{};var cells=[
      summaryField(p,'nameEnglish'),c.name||code,summaryField(p,'nameChinese'),summaryIcOrPassport(p),calcAge(summaryField(p,'dob')),summaryField(p,'email'),summaryField(p,'contact'),summaryGender(p),summaryRace(p),summaryAddress(p),summaryField(p,'finalStart'),summarySalary(p),summaryFinalJobTitle(p),summaryWorkingHours(p),summaryField(p,'finalDept'),summaryField(p,'decision'),r.status
    ];return '<tr>'+cells.map(function(x){return '<td style="border:1px solid #ccc;padding:5px 8px;">'+e2(x||'—')+'</td>';}).join('')+'</tr>';}).join('');
  }).catch(function(err){tbody.innerHTML='<tr><td colspan="17" style="padding:10px;color:#c62828;">Failed to load: '+e2(err.message)+'</td></tr>';});
};

function insertV2EmploymentFields(){
  if(byId('v2EmploymentTerms'))return;
  var title=Array.prototype.find.call(document.querySelectorAll('#officeBox .section-title'),function(x){return x.textContent.indexOf('Appointment Letter Details')>=0;});
  if(!title)return;
  var p=document.createElement('div');p.id='v2EmploymentTerms';p.className='v2-panel';
  p.innerHTML='<h4>MEG-EAF V2 — Employment Terms</h4><div class="v2-grid">'
  +'<div class="form-group"><label>Employment Type <span style="color:red">*</span></label><select id="v2EmploymentType"><option>Permanent Full-Time</option><option>Fixed-Term Full-Time</option><option>Part-Time</option><option>Temporary</option><option>Internship</option></select></div>'
  +'<div class="form-group"><label>Fixed-Term End Date</label><input type="date" id="v2FixedTermEnd"></div>'
  +'<div class="form-group"><label>Probation Period (months) <span style="color:red">*</span></label><input type="number" min="0" max="24" step="1" id="v2ProbationMonths"></div>'
  +'<div class="form-group"><label>Probation Notice <span style="color:red">*</span></label><div style="display:flex;gap:6px"><input type="number" min="0" id="v2ProbationNotice" style="flex:1"><select id="v2ProbationNoticeUnit" style="flex:1"><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select></div></div>'
  +'<div class="form-group"><label>Statutory OT / Additional Work Category <span style="color:red">*</span></label><select id="v2OtCategory"><option value="">-- HR determination required --</option><option value="statutory_ot">Statutory OT eligible</option><option value="non_statutory">Non-statutory OT / Additional Work T&C</option><option value="manual_prescribed">Manual employee / prescribed statutory category</option><option value="part_time">Part-time statutory arrangement</option><option value="other">Other approved category</option></select></div>'
  +'<div class="form-group"><label>Applicable Handbook</label><input type="text" id="v2Handbook" readonly></div>'
  +'<div class="form-group"><label>Normal Off Day</label><input type="text" id="v2OffDay" readonly></div>'
  +'<div class="form-group"><label>Normal Rest Day</label><input type="text" id="v2RestDay" readonly></div>'
  +'<div class="form-group"><label>JD Reference</label><input type="text" id="v2JdReference" readonly></div>'
  +'</div><div class="v2-warn" id="v2ProbationHint" style="margin-top:8px"></div>';
  title.parentNode.insertBefore(p,title.nextSibling);

  // Remuneration fields immediately after current salary/working-hours row.
  var salary=byId('finalSalary');
  if(salary){var row=salary.closest('.form-row');var r=document.createElement('div');r.id='v2Remuneration';r.className='v2-panel';r.innerHTML='<h4>V2 — Fixed Monthly Remuneration</h4><div class="v2-grid">'
    +'<div class="form-group"><label>Basic Salary</label><input type="text" id="v2BasicMirror" readonly></div>'
    +'<div class="form-group"><label>Fixed Contractual Allowance (RM)</label><input type="number" id="v2FixedAllowance" min="0" step="0.01" value="0"></div>'
    +'<div class="form-group"><label>Other Contractual Allowance (RM)</label><input type="number" id="v2OtherAllowance" min="0" step="0.01" value="0"></div>'
    +'<div class="form-group"><label>Total Fixed Monthly Remuneration</label><input type="text" id="v2TotalFixed" readonly></div>'
    +'</div><div style="font-size:10px;color:#666;margin-top:6px">Event, crew, mileage, meal, travel and accommodation claims remain governed by separate Company policy unless expressly stated as contractual.</div>';row.parentNode.insertBefore(r,row.nextSibling);}

  ['v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance'].forEach(function(id){var el=byId(id);if(el){el.addEventListener('input',v2TermsChanged);el.addEventListener('change',v2TermsChanged);}});
  if(salary)salary.addEventListener('input',updateRemuneration);
}

function updateRemuneration(){
  var base=parseFloat((byId('finalSalary')||{}).value||0)||0,fa=parseFloat((byId('v2FixedAllowance')||{}).value||0)||0,oa=parseFloat((byId('v2OtherAllowance')||{}).value||0)||0;
  if(byId('v2BasicMirror'))byId('v2BasicMirror').value=fmtMoney(base);
  if(byId('v2TotalFixed'))byId('v2TotalFixed').value=fmtMoney(base+fa+oa);
}
function applyProfileDefaults(force){
  var p=profile(),c=companyObj();
  if(byId('v2Handbook'))byId('v2Handbook').value=p.handbook;
  if(byId('v2OffDay'))byId('v2OffDay').value=p.offDay;
  if(byId('v2RestDay'))byId('v2RestDay').value=p.restDay;
  if(byId('v2ProbationMonths')&&(force||!byId('v2ProbationMonths').value))byId('v2ProbationMonths').value=p.defaultProbation;
  if(byId('v2ProbationNotice')&&(force||!byId('v2ProbationNotice').value))byId('v2ProbationNotice').value=p.defaultProbationNotice;
  if(byId('v2ProbationNoticeUnit')&&(force||!byId('v2ProbationNoticeUnit').value))byId('v2ProbationNoticeUnit').value=p.defaultProbationNoticeUnit;
  if(byId('v2ProbationHint'))byId('v2ProbationHint').innerHTML=(p.defaultProbation===''?'<strong>Management input required:</strong> Happy Dino / Aborne probation duration and probation notice were intentionally left configurable instead of being assumed. HR must complete these fields before generating the final LOEC.':'Current entity default loaded. HR may change it for an individual appointment where authorised.');
  if(byId('finalFrom')&&!byId('finalFrom').value)byId('finalFrom').value='08:00';
  if(byId('finalTo')&&!byId('finalTo').value)byId('finalTo').value='18:00';
  updateRemuneration();
  populateWorkLocationDropdown();
  populateJobTitleDropdown();
  if(c&&byId('detailInfo')&&currentAppId){/* detail already shows applicant; company chip added elsewhere */}
}
function v2TermsChanged(){updateRemuneration();if(window.isAdmin)renderAppointmentLetter();v2DetectAgreementDrift();}

var oldCompanyChange=window.onEafCompanyChange;
window.onEafCompanyChange=function(){if(typeof oldCompanyChange==='function')oldCompanyChange();applyProfileDefaults(true);var jt=byId('approvedJobTitle'),lv=byId('jobTitleLevel');if(jt)jt.value='';if(lv)lv.innerHTML='<option value="">-- Select level --</option>';if(byId('v2JdReference'))byId('v2JdReference').value='';if(byId('finalDept')&&byId('finalDept').dataset.auto==='1'){byId('finalDept').value='';}if(byId('letterTypeBadge')){byId('letterTypeBadge').textContent='—';byId('letterTypeBadge').style.color='#888';}refreshAppendix1();renderHrApplicantPosts();if(window.isAdmin)renderAppointmentLetter();};

// Work locations are company-specific in V2; manual Other remains available.
var oldPopulateWorkLocation=window.populateWorkLocationDropdown;
window.populateWorkLocationDropdown=function(){
  var sel=byId('workLocation');if(!sel)return;
  var c=companyObj(),p=profile(),vals=[];
  if(c.address)vals.push(c.address);
  if(companyCode()==='meg'||companyCode()==='meh'){
    (window.BRANCHES||[]).forEach(function(x){if(vals.indexOf(x)<0)vals.push(x);});
  }
  var current=sel.value;
  sel.innerHTML='<option value="">-- Select work location --</option>'+vals.map(function(x){return '<option value="'+e2(x)+'">'+e2(x)+'</option>';}).join('');
  if(current&&vals.indexOf(current)>=0)sel.value=current;
};

// JD DATABASE ---------------------------------------------------------------
function loadJdMaster(){
  if(V2.jd)return Promise.resolve(V2.jd);
  if(!window.SESSION||!SESSION.access_token)return Promise.reject(new Error('HR sign-in required'));
  return Promise.all([
    apiFetch('/rest/v1/jd_entities?select=*&is_active=eq.true&order=display_order,name'),
    apiFetch('/rest/v1/jd_departments?select=*&is_active=eq.true&order=name'),
    apiFetch('/rest/v1/jd_positions?select=*&order=entity_id,department_id,level,job_title'),
    apiFetch('/rest/v1/jd_responsibilities?select=*&order=position_id,sequence')
  ]).then(function(a){V2.jd={entities:a[0]||[],departments:a[1]||[],positions:a[2]||[],responsibilities:a[3]||[]};populateJobTitleDropdown();renderHrApplicantPosts();applyPendingRestore();return V2.jd;});
}

var oldLoadProfile=window.loadProfile;
window.loadProfile=function(){return oldLoadProfile().then(function(x){setTimeout(function(){loadJdMaster().catch(function(e){console.warn('V2 JD master unavailable:',e.message);});},0);return x;});};

var oldPopulateJob=window.populateJobTitleDropdown;
function isApprovedJd(p){return String((p&&p.status)||'').toLowerCase()==='approved';}
function familyById(id){return V2.jd&&(V2.jd.departments||[]).find(function(d){return String(d.id)===String(id);})||null;}
function approvedPositionsForFamily(familyId,eid){
  return (V2.jd&&V2.jd.positions||[]).filter(function(p){
    return String(p.department_id)===String(familyId) && String(p.entity_id)===String(eid) && isApprovedJd(p);
  }).slice().sort(function(a,b){
    var la=String(a.level||''),lb=String(b.level||'');
    var n=la.localeCompare(lb,undefined,{numeric:true});return n||String(a.job_title||'').localeCompare(String(b.job_title||''));
  });
}
function approvedFamiliesForEntity(eid){
  if(!V2.jd||!eid)return [];
  return (V2.jd.departments||[]).filter(function(d){
    return String(d.entity_id)===String(eid) && d.is_active!==false && approvedPositionsForFamily(d.id,eid).length>0;
  }).slice().sort(function(a,b){
    var ba=familyBucket(a.name),bb=familyBucket(b.name);if(ba!==bb)return ba==='operations'?-1:1;
    return String(a.name||'').localeCompare(String(b.name||''));
  });
}
function selectedFamily(){
  var sel=byId('approvedJobTitle');if(!sel)return null;
  var val=String(sel.value||'');
  if(val.indexOf('family:')===0)return familyById(val.slice(7));
  if(val.indexOf('jd:')===0&&V2.jd){var p=(V2.jd.positions||[]).find(function(x){return String(x.id)===val.slice(3);});return p?familyById(p.department_id):null;}
  var eid=findEntityId(companyCode()),families=approvedFamiliesForEntity(eid);
  return canonicalLegacyFamily(val,families);
}
function exactJdById(id){return V2.jd&&(V2.jd.positions||[]).find(function(p){return String(p.id)===String(id);})||null;}
function selectedExactJd(){
  var family=selectedFamily(),eid=findEntityId(companyCode()),ls=byId('jobTitleLevel');
  if(!family||!eid||!ls)return null;
  var v=String(ls.value||'');
  if(v.indexOf('jd:')===0){
    var p=exactJdById(v.slice(3));
    return p&&String(p.department_id)===String(family.id)&&String(p.entity_id)===String(eid)&&isApprovedJd(p)?p:null;
  }
  // Compatibility with V1 / earlier V2 values such as "L1|Accounts Associate".
  var parts=v.split('|'),lvl=parts[0]||'',title=parts.slice(1).join('|')||'';
  return approvedPositionsForFamily(family.id,eid).find(function(p){return (!lvl||String(p.level||'')===lvl)&&(!title||cleanPostName(p.job_title)===cleanPostName(title));})||null;
}
function renderFamilyOptions(sel,currentFamilyId){
  var eid=findEntityId(companyCode()),families=approvedFamiliesForEntity(eid);
  var html='<option value="">-- Select approved job title --</option>';
  ['operations','office'].forEach(function(bucket){
    var list=families.filter(function(d){return familyBucket(d.name)===bucket;});if(!list.length)return;
    html+='<optgroup label="'+e2(familyHeading(bucket))+'">'+list.map(function(d){return '<option value="family:'+e2(d.id)+'">'+e2(d.name)+'</option>';}).join('')+'</optgroup>';
  });
  html+='<option value="__OTHER__">Other (type manually)</option>';
  sel.innerHTML=html;
  if(currentFamilyId&&Array.prototype.some.call(sel.options,function(o){return o.value==='family:'+String(currentFamilyId);}))sel.value='family:'+String(currentFamilyId);
  return families;
}
window.populateJobTitleDropdown=function(){
  var sel=byId('approvedJobTitle');if(!sel)return;
  var previous=String(sel.value||''),previousFamily=null;
  if(previous.indexOf('family:')===0)previousFamily=previous.slice(7);
  else if(previous.indexOf('jd:')===0){var oldP=exactJdById(previous.slice(3));if(oldP)previousFamily=oldP.department_id;}
  if(!V2.jd){
    sel.innerHTML='<option value="">-- JD Master loading --</option><option value="__OTHER__">Other (type manually)</option>';
    return;
  }
  var eid=findEntityId(companyCode());
  if(!eid){
    sel.innerHTML='<option value="">-- No JD entity configured for this legal employer --</option><option value="__OTHER__">Other (type manually)</option>';
    if(byId('jobTitleLevel'))byId('jobTitleLevel').innerHTML='<option value="">-- Select level --</option>';
    if(byId('v2JdReference'))byId('v2JdReference').value='';
    return;
  }
  renderFamilyOptions(sel,previousFamily);
};

var oldResolve=window.resolvePosition;
window.resolvePosition=function(){
  var sel=byId('approvedJobTitle'),val=sel?String(sel.value||''):'';
  if(val==='__OTHER__')return oldResolve();
  var family=selectedFamily(),p=selectedExactJd();
  if(family&&p){
    var resp=(V2.jd.responsibilities||[]).filter(function(r){return String(r.position_id)===String(p.id);}).map(function(r){return {k:r.title||'Responsibility',v:r.description||''};});
    return {code:null,title:p.job_title||'',lvl:p.level||'',purpose:p.purpose||'',respItems:resp,deptName:family.name||deptName(p.department_id),jdId:p.id,jdReference:p.reference||'',reportsTo:p.reports_to||'',employmentType:p.employment_type||'',location:p.location||'',familyId:family.id,familyName:family.name||''};
  }
  if(family)return {code:null,title:'',lvl:'',purpose:'',respItems:[],deptName:family.name||'',jdId:'',jdReference:'',familyId:family.id,familyName:family.name||''};
  return oldResolve();
};

var oldJobTitleChange=window.onJobTitleChange;
var oldLevelChange=window.onLevelChange;
window.onJobTitleChange=function(){
  var sel=byId('approvedJobTitle'),val=sel?String(sel.value||''):'';
  if(val==='__OTHER__'){
    if(byId('v2JdReference'))byId('v2JdReference').value='';
    return oldJobTitleChange();
  }
  var family=selectedFamily(),eid=findEntityId(companyCode()),ls=byId('jobTitleLevel');
  if(byId('jobTitleOtherWrap'))byId('jobTitleOtherWrap').style.display='none';
  if(!family||!eid){if(ls)ls.innerHTML='<option value="">-- Select level --</option>';if(byId('v2JdReference'))byId('v2JdReference').value='';return oldLevelChange();}
  var previous=ls?String(ls.value||''):'';
  var oldId=previous.indexOf('jd:')===0?previous.slice(3):'';
  var rows=approvedPositionsForFamily(family.id,eid);
  if(ls){
    ls.innerHTML='<option value="">-- Select approved level --</option>'+rows.map(function(p){return '<option value="jd:'+e2(p.id)+'">'+e2((p.level||'')+' — '+(p.job_title||''))+(p.reference?' ['+e2(p.reference)+']':'')+'</option>';}).join('');
    if(oldId&&rows.some(function(p){return String(p.id)===String(oldId);} ))ls.value='jd:'+oldId;
  }
  if(byId('finalDept')){byId('finalDept').value=family.name||'';byId('finalDept').dataset.auto='1';}
  if(byId('v2JdReference'))byId('v2JdReference').value='';
  oldLevelChange();
};
window.onLevelChange=function(){
  oldLevelChange();
  var p=selectedExactJd(),rp=resolvePosition();
  if(byId('v2JdReference'))byId('v2JdReference').value=p?(p.reference||''):'';
  if(p&&byId('reportingTitle')&&!byId('reportingTitle').value&&p.reports_to)byId('reportingTitle').value=p.reports_to;
  if(p&&byId('v2EmploymentType')&&p.employment_type&&!byId('v2EmploymentType').dataset.userSet)byId('v2EmploymentType').value=p.employment_type;
  if(rp&&rp.deptName&&byId('finalDept')&&(!byId('finalDept').value||byId('finalDept').dataset.auto==='1')){byId('finalDept').value=rp.deptName;byId('finalDept').dataset.auto='1';}
};

function renderHrApplicantPosts(){
  var host=byId('postGroup');if(!host)return;
  var eid=findEntityId(companyCode()),positions=[],families=[];
  if(V2.jd&&eid){
    positions=(V2.jd.positions||[]).filter(function(p){return String(p.entity_id)===String(eid)&&isApprovedJd(p);});
    var deptIds={};positions.forEach(function(p){deptIds[String(p.department_id)]=true;});
    families=(V2.jd.departments||[]).filter(function(d){return String(d.entity_id)===String(eid)&&deptIds[String(d.id)]&&d.is_active!==false;}).slice().sort(function(a,b){
      var ga=familyBucket(a.name),gb=familyBucket(b.name);if(ga!==gb)return ga==='operations'?-1:1;return String(a.name||'').localeCompare(String(b.name||''));
    });
  }
  if(!families.length)return;

  var pending=V2.pendingRestore||{};
  var selected=uniqueText((pending.cb_post||[]).concat(pending.selectedPostFamilies||[]));
  var selectedIds=(pending.selectedPostFamilyIds||[]).map(String);
  var legacyDeptIds={};

  // Compatibility path 1: Build 03 exact applicant JD title -> its general JD family.
  selected.forEach(function(v){
    var p=positions.find(function(x){return cleanPostName(x.job_title)===cleanPostName(v);});
    if(p)legacyDeptIds[String(p.department_id)]=true;
    var f=canonicalLegacyFamily(v,families);if(f)legacyDeptIds[String(f.id)]=true;
  });

  var html='';
  ['operations','office'].forEach(function(bucket){
    var list=families.filter(function(d){return familyBucket(d.name)===bucket;});
    if(!list.length)return;
    html+='<div style="width:100%;font-weight:700;color:'+(bucket==='operations'?'#2e7d32':'#1565c0')+';margin:8px 0 5px">'+familyHeading(bucket)+'</div>';
    list.forEach(function(d){html+='<label><input type="checkbox" name="post" value="'+e2(d.name)+'" data-post-family-id="'+e2(d.id)+'"> '+e2(d.name)+'</label>';});
  });
  html+='<div style="width:100%;font-weight:700;color:#666;margin:10px 0 4px">Other / Another Intended Post</div>';
  html+='<label style="width:100%"><input type="checkbox" name="post" value="Other / Another intended post" id="postOtherCheckHr"> Other: <input type="text" id="postOtherDynamicHr" style="width:260px;border:none;border-bottom:1px solid #555;margin-left:4px" placeholder="Applicant alternative / manual entry"></label>';
  host.innerHTML=html;

  Array.prototype.forEach.call(host.querySelectorAll('input[name="post"][data-post-family-id]'),function(cb){
    if(selectedIds.indexOf(String(cb.dataset.postFamilyId))>=0||legacyDeptIds[String(cb.dataset.postFamilyId)])cb.checked=true;
  });

  // Only genuinely unmapped historic values are preserved under Other.
  var unmapped=selected.filter(function(v){
    if(!v||String(v).indexOf('Other /')===0)return false;
    if(canonicalLegacyFamily(v,families))return false;
    if(positions.some(function(p){return cleanPostName(p.job_title)===cleanPostName(v);} ))return false;
    return true;
  });
  var combined=uniqueText([pending.postOtherManual,pending.postOtherSelection,pending.postOtherDynamic,pending.postOtherOps,pending.postOther].concat(unmapped)).join(', ');
  if(byId('postOtherDynamicHr'))byId('postOtherDynamicHr').value=combined;
  if(byId('postOtherCheckHr')&&(combined||selected.some(function(v){return String(v||'').indexOf('Other /')===0;})))byId('postOtherCheckHr').checked=true;
}

// V2 form persistence --------------------------------------------------------
var oldCollect=window.collectFormData;
window.collectFormData=function(){var d=oldCollect();d.v2Schema='2.1';d.v2RecruitmentSchema='general-post-family-v1';[
  'v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance','v2JdReference'
].forEach(function(id){var el=byId(id);if(el)d[id]=el.value;});
  d.selectedPostFamilyIds=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-post-family-id]'),function(x){return x.dataset.postFamilyId;});
  d.selectedPostFamilies=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-post-family-id]'),function(x){return x.value;});
  var otherHr=byId('postOtherDynamicHr');
  if(otherHr){var val=otherHr.value.trim();d.postOtherDynamic=val;if(val){d.postOtherManual=val;d.postOtherSelection='';d.postOtherSelectedFamilyId='';}else if(V2.pendingRestore){d.postOtherSelection=V2.pendingRestore.postOtherSelection||'';d.postOtherSelectedFamilyId=V2.pendingRestore.postOtherSelectedFamilyId||'';d.postOtherManual=V2.pendingRestore.postOtherManual||'';}}
  var family=selectedFamily(),rp=resolvePosition();
  if(family){d.approvedJobTitle=family.name||'';d.v2ApprovedFamilyId=family.id||'';d.v2ApprovedFamilyName=family.name||'';}
  else{d.v2ApprovedFamilyId='';d.v2ApprovedFamilyName='';}
  if(rp&&rp.jdId){d.jobTitleLevel=(rp.lvl||'')+'|'+(rp.title||'');d.v2ResolvedJobTitle=rp.title||'';d.v2JdId=rp.jdId||'';d.v2JdReference=rp.jdReference||'';}
  else{d.v2ResolvedJobTitle='';d.v2JdId='';d.v2JdReference='';}
  d.v2Handbook=profile().handbook;d.v2OffDay=profile().offDay;d.v2RestDay=profile().restDay;return d;};
var oldRestore=window.restoreFormData;
window.restoreFormData=function(d){V2.pendingRestore=d||{};oldRestore(d||{});setTimeout(function(){renderHrApplicantPosts();applyPendingRestore();},0);setTimeout(function(){renderHrApplicantPosts();applyPendingRestore();},400);};
function applyPendingRestore(){var d=V2.pendingRestore||{};[
  'v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance','v2JdReference'
].forEach(function(id){if(byId(id)&&d[id]!==undefined)byId(id).value=d[id];});
  var titleSel=byId('approvedJobTitle'),levelSel=byId('jobTitleLevel'),eid=findEntityId(companyCode()),families=approvedFamiliesForEntity(eid),family=null,exact=null;
  if(titleSel&&V2.jd&&eid){
    if(d.v2ApprovedFamilyId)family=familyById(d.v2ApprovedFamilyId);
    if(!family&&d.v2JdId){exact=exactJdById(d.v2JdId);if(exact)family=familyById(exact.department_id);}
    var av=String(d.approvedJobTitle||'');
    if(!family&&av.indexOf('family:')===0)family=familyById(av.slice(7));
    if(!family&&av.indexOf('jd:')===0){exact=exactJdById(av.slice(3));if(exact)family=familyById(exact.department_id);}
    if(!family)family=canonicalLegacyFamily(d.v2ApprovedFamilyName||av,families);
    if(!family&&av){var byTitle=(V2.jd.positions||[]).find(function(p){return String(p.entity_id)===String(eid)&&isApprovedJd(p)&&cleanPostName(p.job_title)===cleanPostName(av);});if(byTitle){exact=byTitle;family=familyById(byTitle.department_id);}}
    if(family&&String(family.entity_id)===String(eid)){
      titleSel.value='family:'+family.id;onJobTitleChange();
      if(!exact&&d.v2JdId)exact=exactJdById(d.v2JdId);
      if(!exact&&String(d.jobTitleLevel||'').indexOf('jd:')===0)exact=exactJdById(String(d.jobTitleLevel).slice(3));
      if(!exact&&av.indexOf('jd:')===0)exact=exactJdById(av.slice(3));
      if(!exact&&d.v2JdReference)exact=(V2.jd.positions||[]).find(function(p){return String(p.reference||'')===String(d.v2JdReference);});
      if(!exact&&d.jobTitleLevel){var parts=String(d.jobTitleLevel).split('|'),lv=parts[0]||'',ti=parts.slice(1).join('|')||'';exact=approvedPositionsForFamily(family.id,eid).find(function(p){return (!lv||String(p.level||'')===lv)&&(!ti||cleanPostName(p.job_title)===cleanPostName(ti));});}
      if(exact&&String(exact.department_id)===String(family.id)&&String(exact.entity_id)===String(eid)&&isApprovedJd(exact)&&levelSel){levelSel.value='jd:'+exact.id;onLevelChange();}
    }else if(av==='__OTHER__'){titleSel.value='__OTHER__';onJobTitleChange();if(d.jobTitleLevel&&levelSel){levelSel.value=d.jobTitleLevel;onLevelChange();}}
  }
  applyProfileDefaults(false);updateRemuneration();if(currentAppId)setTimeout(v2LoadLoecRecord,60);
}

var oldGather=window.gatherLoceData;
window.gatherLoceData=function(){var d=oldGather(),rp=resolvePosition(),base=parseFloat((byId('finalSalary')||{}).value||0)||0,fa=parseFloat((byId('v2FixedAllowance')||{}).value||0)||0,oa=parseFloat((byId('v2OtherAllowance')||{}).value||0)||0;d.companyCode=companyCode();d.company=companyObj();d.entityProfile=profile();d.employmentType=(byId('v2EmploymentType')||{}).value||'Permanent Full-Time';d.fixedTermEnd=fmtDateLong((byId('v2FixedTermEnd')||{}).value||'');d.probationMonths=(byId('v2ProbationMonths')||{}).value||'';d.probationNotice=(byId('v2ProbationNotice')||{}).value||'';d.probationNoticeUnit=(byId('v2ProbationNoticeUnit')||{}).value||'weeks';d.otCategory=(byId('v2OtCategory')||{}).value||'';d.basicSalary=base;d.fixedAllowance=fa;d.otherAllowance=oa;d.totalFixed=base+fa+oa;d.basicSalaryFmt=fmtMoney(base);d.fixedAllowanceFmt=fmtMoney(fa);d.otherAllowanceFmt=fmtMoney(oa);d.totalFixedFmt=fmtMoney(d.totalFixed);d.jdId=rp.jdId||'';d.jdReference=rp.jdReference||'';d.jdLevel=rp.lvl||'';return d;};

// V2 combined LOEC -----------------------------------------------------------
window.buildLocePage1HTML=function(d){var c=d.company||companyObj(),p=d.entityProfile||profile();var fixed=d.employmentType==='Fixed-Term Full-Time'&&d.fixedTermEnd?'<tr><td>Employment Term</td><td>'+e2(d.employmentType)+' until '+e2(d.fixedTermEnd)+'</td></tr>':'<tr><td>Employment Type</td><td>'+e2(d.employmentType)+'</td></tr>';return ''
  +'<p class="letter-private">PRIVATE &amp; CONFIDENTIAL</p><p>'+d.letterDateFmt+'</p><div class="letter-tight" style="margin-top:10px"><p>'+d.name+'</p><p>'+d.ic+'</p>'+d.addrLines.map(function(l){return '<p>'+l+'</p>';}).join('')+'</div>'
  +'<p style="margin-top:14px">Dear '+d.title+' '+d.name+',</p><p class="l-clause-title" style="text-align:left;text-decoration:underline">LETTER OF OFFER &amp; CONTRACT OF EMPLOYMENT — '+(d.jobTitle||'').toUpperCase()+'</p>'
  +'<p>This Letter of Offer and Contract of Employment is made on <strong>'+d.letterDateFmt+'</strong> between:</p><p><strong>'+e2(c.name)+'</strong> (Company No.: <strong>'+e2(c.regNo)+'</strong>), a company incorporated in Malaysia with its registered address at <strong>'+e2(c.regAddress)+'</strong> ("the Employer"), and</p>'
  +'<p><strong>'+d.name+'</strong> (NRIC/Passport No.: <strong>'+d.ic+'</strong>), of <strong>'+d.addrInline+'</strong> ("the Employee").</p><p><strong>This is one combined employment agreement.</strong> By signing it after reviewing the complete document and Appendix 1, the Employee accepts the offer of employment and agrees to the Employment Contract at the same time.</p>'
  +'<p>The Employer employs the Employee, and the Employee agrees to serve the Employer, on the following salient terms and conditions:</p><table class="l-salient"><tr><th style="width:42%">Salient Term</th><th>Detail</th></tr>'
  +'<tr><td>a. Job Title</td><td>'+d.jobTitle+(d.jdReference?'<br><small>JD Ref: '+e2(d.jdReference)+(d.jdLevel?' · '+e2(d.jdLevel):'')+'</small>':'')+'</td></tr><tr><td>b. Commencement Date</td><td>'+d.startDateFmt+'</td></tr>'+fixed
  +'<tr><td>Probationary Period</td><td>'+e2(d.probationMonths||'—')+' month(s)</td></tr><tr><td>Basic Salary</td><td>'+d.basicSalaryFmt+' ('+d.salaryWords+')</td></tr>'
  +(d.fixedAllowance?'<tr><td>Fixed Contractual Allowance</td><td>'+d.fixedAllowanceFmt+'</td></tr>':'')+(d.otherAllowance?'<tr><td>Other Contractual Allowance</td><td>'+d.otherAllowanceFmt+'</td></tr>':'')
  +'<tr><td>Total Fixed Monthly Remuneration</td><td>'+d.totalFixedFmt+'</td></tr><tr><td>Working Hours</td><td>'+workingHoursSalientText(d)+'</td></tr><tr><td>Normal Off Day / Rest Day</td><td>'+e2(p.offDay)+' / '+e2(p.restDay)+'</td></tr><tr><td>Place of Work</td><td>'+d.workLocation+'</td></tr><tr><td>Reporting Personnel</td><td>'+d.reportingName+'</td></tr></table>';};

window.buildLoceClauseBlocks=function(d){var p=d.entityProfile||profile(),code=d.companyCode||companyCode(),blocks=[];function H(s){return BH('<p class="l-clause-title">'+s+'</p>');}function add(n,t){blocks.push(C(n,t));}
  blocks.push(H('1. COMMENCEMENT AND TERM'));add('1.1','The Employee’s employment commences on '+d.startDateFmt+' ("Commencement Date") and continues subject to this Contract until lawfully terminated.');add('1.2',d.employmentType==='Fixed-Term Full-Time'&&d.fixedTermEnd?'This is a fixed-term employment ending on '+d.fixedTermEnd+', unless renewed or earlier lawfully terminated in accordance with this Contract.':'This employment is '+d.employmentType+'.');
  blocks.push(H('2. POSITION, REPORTING AND DUTIES'));add('2.1','The Employee is employed as '+d.jobTitle+' under '+d.dept+' department and reports to '+d.reportingName+', or such other authorised person as the Employer may designate.');add('2.2','The Employee shall perform the duties set out in Appendix 1 (Job Description) and other lawful and reasonable duties consistent with the position, capability and Employer’s business needs.');add('2.3','The Employee shall not, without prior written consent, engage in outside work or business that creates a conflict of interest, competes with the Employer, uses Company time/resources, or materially affects attendance or performance.');
  blocks.push(H('3. PROBATION AND CONFIRMATION'));add('3.1','The Employee will undergo a probationary period of '+e2(d.probationMonths||'—')+' month(s) from the Commencement Date.');add('3.2','During probation, either party may terminate this Contract by giving '+e2(d.probationNotice||'—')+' '+e2(d.probationNoticeUnit||'weeks')+' written notice, or lawful indemnity in lieu of notice. The notice period is the same for Employer and Employee.');add('3.3','Confirmation is effective only when communicated in writing. Where further assessment is reasonably required, probation may be extended by written notice, subject to the Employee’s written terms and applicable law.');

  var placeHeading=code==='hds'?'4. PLACE OF WORK, SCHOOL / PROGRAMME ASSIGNMENT AND TRANSFER':(code==='abn'?'4. PLACE OF WORK, EVENT / PROJECT ASSIGNMENT AND TRANSFER':'4. PLACE OF WORK AND TRANSFER');
  blocks.push(H(placeHeading));add('4.1','The Employee’s normal place of work is '+d.workLocation+'.');
  if(code==='hds'){
    add('4.2','Happy Dino operates programmes at its office, schools, client premises, event venues and other approved programme locations. The Employee may be reasonably assigned to such locations according to programme requirements. A lawful temporary assignment or venue deployment does not by itself change the legal employer.');
    add('4.3','School programmes, science camps, demonstrations, promotional activities and other approved programmes may require programme preparation, equipment loading or unloading, setup, pack-down and authorised work-related travel where relevant to the Employee’s role.');
  }else if(code==='abn'){
    add('4.2','Aborne Project operates at its office, client premises, hotels, halls, restaurants, outdoor sites, event venues and other approved project locations. The Employee may be reasonably assigned to such locations according to project requirements. A lawful temporary assignment or venue deployment does not by itself change the legal employer.');
    add('4.3','Event and project assignments may include site visits, client meetings, rehearsals, setup, live-event execution, dismantling, pack-down and authorised work-related travel where relevant to the Employee’s role.');
  }else{
    add('4.2',p.workLocationText+' A lawful temporary assignment or transfer does not by itself change the legal employer.');
  }

  blocks.push(H('5. HOURS OF WORK, REST DAY AND ADDITIONAL WORK'));add('5.1','The Employee’s normal working hours are from '+d.timeFrom+' to '+d.timeTo+', subject to the statutory working-time framework and genuine meal/rest periods during which the Employee is free from duties.');add('5.2','Under the normal schedule, '+p.offDay+' is the general Off Day and '+p.restDay+' is ordinarily the Rest Day. Roster changes and work on a Rest Day or public holiday will be administered according to Malaysian law and applicable written terms.');
  if(code==='hds')add('5.3','Where required by an authorised school programme, camp or Company event, operational scheduling may involve earlier reporting times, later finishing times, weekends, public holidays, programme preparation, setup, pack-down or authorised travel. Any mandatory time that qualifies as working time under Malaysian law shall be treated accordingly.');
  else if(code==='abn')add('5.3','Where required by an authorised event or project, operational scheduling may involve early call times, evenings, nights, weekends, public holidays, venue inspections, rehearsals, setup, live-event execution, dismantling, pack-down or authorised travel. Any mandatory time that qualifies as working time under Malaysian law shall be treated accordingly.');
  else add('5.3','Any authorised change to the normal schedule will be communicated through the applicable roster, instruction or written arrangement and administered according to Malaysian law and the Employee’s written terms.');
  add('5.4','The Employee’s statutory overtime / additional-work treatment is based on the applicable legal category and written terms. HR classification: '+e2(d.otCategory||'to be determined in the HR record')+'. Employees outside statutory payment coverage receive only such allowance, time-off or other arrangement as is expressly provided by their written terms or Company policy.');

  blocks.push(H('6. WAGES, ALLOWANCES AND STATUTORY CONTRIBUTIONS'));add('6.1','The Employee is paid a basic salary of '+d.basicSalaryFmt+' ('+d.salaryWords+') per month. Fixed contractual allowance(s), if any, are stated in the salient terms. Wages are paid within the statutory deadline through an approved financial institution, less lawful deductions.');
  if(code==='hds')add('6.2','Programme, camp, mileage, meal, travel, accommodation, authorised material purchases and reimbursement claims are governed by separate current Company policy unless expressly stated as fixed contractual remuneration. Bonus, increment and other variable benefits are discretionary unless guaranteed in writing.');
  else if(code==='abn')add('6.2','Event, project, crew, mileage, meal, travel, accommodation, authorised purchasing and reimbursement claims are governed by separate current Company policy unless expressly stated as fixed contractual remuneration. Bonus, increment and other variable benefits are discretionary unless guaranteed in writing.');
  else add('6.2','Travel, mileage, meal, authorised purchasing and reimbursement claims are governed by separate current Company policy unless expressly stated as fixed contractual remuneration. Bonus, increment and other variable benefits are discretionary unless guaranteed in writing.');
  add('6.3','The Employer shall make applicable statutory deductions and contributions including EPF/KWSP, SOCSO/PERKESO, EIS/SIP and tax deductions at prevailing rates.');

  blocks.push(H('7. LEAVE AND PUBLIC HOLIDAYS'));add('7.1','Statutory annual leave is 8 days for less than 2 years of continuous service, 12 days for 2 years to less than 5 years, and 16 days for 5 years or more, subject to the Employment Act 1955 and any lawful more-favourable Company benefit.');blocks.push(BA('<p class="l-tbl-title">Table A — Statutory Annual Leave</p><table><tr><th>Continuous Service</th><th>Paid Annual Leave</th></tr><tr><td>&lt; 2 years</td><td>8 days</td></tr><tr><td>2 years to &lt; 5 years</td><td>12 days</td></tr><tr><td>5 years and above</td><td>16 days</td></tr></table>'));add('7.2','Paid sick leave is 14 days for less than 2 years of service, 18 days for 2 years to less than 5 years, and 22 days for 5 years or more, plus 60 days paid hospitalisation leave where hospitalisation is necessary, subject to the Employment Act 1955 and valid certification requirements.');blocks.push(BA('<p class="l-tbl-title">Table B — Statutory Sick / Hospitalisation Leave</p><table><tr><th>Continuous Service</th><th>Paid Sick Leave</th><th>Paid Hospitalisation Leave</th></tr><tr><td>&lt; 2 years</td><td>14 days</td><td>60 days</td></tr><tr><td>2 years to &lt; 5 years</td><td>18 days</td><td>60 days</td></tr><tr><td>5 years and above</td><td>22 days</td><td>60 days</td></tr></table>'));add('7.3','The Employee is entitled to paid public holidays, maternity leave, paternity leave and other statutory leave in accordance with applicable Malaysian law. Any additional Company benefit is governed by the applicable Employee Handbook or written benefit policy.');

  blocks.push(H('8. FLEXIBLE WORKING ARRANGEMENT'));
  if(code==='hds')add('8.1','An employee may apply in writing for a flexible working arrangement in accordance with the Employment Act 1955. School-facing, child-facing and programme-delivery roles may have limited practical flexibility where physical presence, supervision, programme timing or safe delivery is an essential duty.');
  else if(code==='abn')add('8.1','An employee may apply in writing for a flexible working arrangement in accordance with the Employment Act 1955. Client-facing, venue-facing and live-event roles may have limited practical flexibility where physical presence, call time, rehearsal, setup or project execution is an essential duty.');
  else add('8.1','An employee may apply in writing for a flexible working arrangement in accordance with the Employment Act 1955. Any approved arrangement remains subject to the operational requirements of the Employee’s role.');

  blocks.push(H('9. HANDBOOK, BENEFITS AND COMPANY POLICIES'));add('9.1','The Employee shall comply with the applicable '+e2(p.handbook)+' and lawful Company policies, SOPs, safety rules and authorised instructions as amended from time to time.');add('9.2','Benefits, if any, are governed by the Employee’s written terms and applicable Company benefit policies. A past discretionary benefit does not become a guaranteed contractual entitlement merely through past practice unless law or written contract provides otherwise.');

  if(code==='hds'){
    blocks.push(H('10. HAPPY DINO CHILD SAFETY, SCHOOL PROGRAMME AND PROFESSIONAL DUTIES'));
    add('10.1','The Employee must safeguard the welfare, dignity and safety of children and participants, maintain appropriate professional boundaries and comply with Happy Dino’s approved child-safety, school and programme procedures. Any safeguarding concern, injury, unsafe condition or serious behavioural incident must be reported promptly through the authorised Company route.');
    add('10.2','Where supervision forms part of the Employee’s assigned duties, the Employee must follow approved attendance, headcount, movement, supervision and handover procedures and must not release a child contrary to the authorised school, parent/guardian or Company arrangement.');
    add('10.3','Corporal punishment, humiliating or degrading treatment, threatening behaviour, abusive language, inappropriate physical contact and other conduct inconsistent with professional child-safe practice are prohibited.');
    add('10.4','Photographs, videos, recordings, student information and parent/guardian information may be captured, used, stored or shared only for authorised work purposes and in accordance with applicable consent, school requirements, Company policy and law. Employees must not publish or privately circulate such material through personal accounts without authority.');
    add('10.5','Science, activity and programme materials, tools and equipment must be used according to approved instructions and safety controls. Damaged, missing or potentially unsafe equipment or materials must be isolated where reasonably practicable and reported promptly.');
    add('10.6','Employees assigned to Happy Dino camps, school programmes, promotional activities and Company events must wear the designated Happy Dino uniform and required safe footwear unless Management authorises alternative attire for a particular assignment.');
  }else if(code==='abn'){
    blocks.push(H('10. ABORNE EVENT, CLIENT AND PROFESSIONAL DUTIES'));
    add('10.1','The Employee must protect client trust, follow authorised event/project instructions, comply with venue and site rules, safeguard Company and client property, and promptly escalate material safety, operational or client-service issues to the Event Lead, Project PIC or Management.');
    add('10.2','Unless specifically authorised in writing, the Employee must not commit Aborne Project to prices, discounts, refunds, purchases, supplier appointments, contractual promises, scope changes or other financial or commercial obligations.');
    add('10.3','Client lists, quotations, pricing, proposals, concepts, production plans, run sheets, schedules, floor plans, guest information, supplier arrangements and other non-public project materials must be used only for authorised Company work and protected from unauthorised disclosure.');
    add('10.4','Employees must comply with event-specific mandatory attire, accreditation, access-control and identification requirements instructed by the Event Lead / Project PIC or Management.');
    add('10.5','Employees must not consume alcohol while on duty or while representing Aborne Project at an event. There is no hospitality exception. Reporting for duty while impaired by alcohol, illegal drugs or another substance that makes performance unsafe is prohibited.');
    add('10.6','The Employee must comply with applicable event, venue, equipment and site-safety procedures and must promptly report accidents, damage, loss, unsafe conditions, access breaches or other material incidents.');
  }else{
    blocks.push(H('10. CONDUCT, CONFIDENTIALITY AND INTELLECTUAL PROPERTY'));add('10.1','The Employee shall comply with the Employee Handbook, professional conduct standards, confidentiality obligations, IT rules, safety requirements and other lawful policies of the Employer.');
  }

  blocks.push(H('11. CONFIDENTIALITY, RECORDS AND INTELLECTUAL PROPERTY'));
  if(code==='hds'){
    add('11.1','The Employee shall protect non-public Employer, school, child/student, participant, parent/guardian, client, vendor, financial, HR, operational and investigation information obtained through employment and shall not disclose or use it without authority.');
    add('11.2','The Employee must not falsify, destroy, conceal, delete, export or unauthorisedly remove Company, school or programme records, attendance information, incident records, child/participant information or business information.');
    add('11.3','Programme plans, activity materials, training content, science/activity concepts, worksheets, operational documents and other work product created in the course of authorised employment shall be handled in accordance with the Contract and applicable Malaysian law.');
  }else if(code==='abn'){
    add('11.1','The Employee shall protect non-public Employer, client, guest, vendor, pricing, quotation, proposal, financial, HR, production, operational and investigation information obtained through employment and shall not disclose or use it without authority.');
    add('11.2','The Employee must not falsify, destroy, conceal, delete, export or unauthorisedly remove Company or client records, quotations, run sheets, project files, correspondence, credentials or business information.');
    add('11.3','Event concepts, proposals, designs, production plans, run sheets, operational documents and other work product created in the course of authorised employment shall be handled in accordance with the Contract and applicable Malaysian law.');
  }else{
    add('11.1','The Employee shall protect non-public Employer, client, participant, vendor, financial, HR, operational and investigation information obtained through employment and shall not disclose or use it without authority.');
    add('11.2','The Employee must not falsify, destroy, conceal, delete, export or unauthorisedly remove Company records or business information.');
    add('11.3','Work product created in the course of authorised employment shall be handled in accordance with the Contract and applicable Malaysian law.');
  }

  blocks.push(H('12. EQUAL OPPORTUNITY, HARASSMENT, BULLYING AND SAFETY'));add('12.1','Unlawful discrimination, sexual harassment, bullying, threats and workplace violence are prohibited. The Employer will administer complaints and safety concerns according to Malaysian law and Company procedure.');
  if(code==='hds')add('12.2','The Employee must take reasonable care for personal safety and for the safety of children, participants, colleagues and others affected by the Employee’s acts or omissions and must comply with applicable school, programme, activity, equipment and venue safety requirements.');
  else if(code==='abn')add('12.2','The Employee must take reasonable care for personal safety and for others affected by the Employee’s acts or omissions and must comply with applicable workplace, event, venue, equipment and project-site safety requirements.');
  else add('12.2','The Employee must take reasonable care for personal safety and for others affected by the Employee’s acts or omissions and comply with applicable workplace safety requirements.');

  blocks.push(H('13. PERSONAL DATA AND EMPLOYMENT RECORDS'));add('13.1','The Employer may collect, process, retain and disclose employment-related personal information for legitimate employment, payroll, statutory, safety, administrative and verification purposes in accordance with applicable Malaysian law and Company notices.');

  blocks.push(H('14. ABSENCE AND ATTENDANCE'));
  if(code==='hds')add('14.1','The Employee must report absence, lateness or inability to attend a scheduled shift, school programme, camp or Company assignment as soon as reasonably practicable through the approved Company route so that participant supervision and programme coverage can be arranged. Unauthorised absence may lead to lawful unpaid treatment for time not worked and/or disciplinary action.');
  else if(code==='abn')add('14.1','The Employee must report absence, lateness or inability to attend an event, project, rehearsal, setup or other scheduled assignment as soon as reasonably practicable through the approved Company route so that operational coverage can be arranged. Unauthorised absence may lead to lawful unpaid treatment for time not worked and/or disciplinary action.');
  else add('14.1','The Employee must report absence, lateness or inability to attend scheduled work as soon as reasonably practicable through the approved Company route. Unauthorised absence may lead to lawful unpaid treatment for time not worked and/or disciplinary action.');

  blocks.push(H('15. NOTICE, RESIGNATION AND TERMINATION'));add('15.1','After confirmation, either party may terminate this Contract by written notice of 4 weeks for less than 2 years of service, 6 weeks for 2 years to less than 5 years, and 12 weeks for 5 years or more, unless a lawful written term provides otherwise. Lawful indemnity in lieu may apply.');blocks.push(BA('<p class="l-tbl-title">Table C — Notice of Termination After Confirmation</p><table><tr><th>Continuous Service</th><th>Notice</th></tr><tr><td>&lt; 2 years</td><td>4 weeks</td></tr><tr><td>2 years to &lt; 5 years</td><td>6 weeks</td></tr><tr><td>5 years and above</td><td>12 weeks</td></tr></table>'));add('15.2','Annual leave does not automatically shorten the notice period. Statutory annual leave and any untaken balance on termination shall be administered according to applicable law and Company procedure.');
  if(code==='hds')add('15.3','Serious misconduct may result in disciplinary action up to dismissal after due inquiry where required. On termination the Employee must complete reasonable handover and return programme files, attendance or incident records, school/parent communications held for work, Company equipment, materials, documents, keys, devices and access credentials.');
  else if(code==='abn')add('15.3','Serious misconduct may result in disciplinary action up to dismissal after due inquiry where required. On termination the Employee must complete reasonable handover and return project files, run sheets, client correspondence, venue passes, credentials, Company equipment, documents, devices, keys and system access.');
  else add('15.3','Serious misconduct may result in disciplinary action up to dismissal after due inquiry where required. On termination the Employee must complete reasonable handover and return Company property, records and access.');

  blocks.push(H('16. DISCIPLINE, GRIEVANCE AND GOOD-FAITH REPORTING'));add('16.1','Disciplinary action is evidence-based and proportionate. The Employee will be informed of material allegations and given a reasonable opportunity to respond. The Company may use precautionary measures that are protective and do not themselves establish guilt.');add('16.2','The Employee may raise grievances and good-faith reports through the applicable Company process without prohibited retaliation.');
  blocks.push(H('17. GOVERNING LAW, LANGUAGE AND LEGAL HIERARCHY'));add('17.1','This Contract is governed by the laws of Malaysia and is intended for employment in Peninsular Malaysia.');add('17.2','Mandatory Malaysian statutory minimums prevail over any less-favourable contractual or policy wording, while lawful more-favourable written benefits continue according to their terms.');add('17.3','The English version of this Contract governs the Company’s interpretation, subject to any mandatory Malaysian language or form requirement.');
  blocks.push(H('18. ENTIRE AGREEMENT, JD AND VARIATION'));add('18.1','This combined Letter of Offer & Contract of Employment, Appendix 1 Job Description, applicable Employee Handbook and incorporated written policies form the employment documentation. Appendix 1 records the initial JD applicable when this Contract is signed.');add('18.2','A later JD version may be assigned and acknowledged through the Company’s employment system without reissuing the entire Contract where the change is within the lawful employment relationship and does not unlawfully alter a fundamental contractual term. Any variation to a core contractual term shall use the legally appropriate written process.');
  blocks.push(H('19. MANUAL SIGNING, RECORD COPY AND STAMP DUTY'));add('19.1','This Contract is intended to be reviewed and signed manually by the Employee and an authorised Employer representative. The signed paper agreement may be scanned and uploaded into the Company’s employment system as the official digital record copy.');add('19.2','This Contract shall be stamped in accordance with applicable Malaysian stamp duty requirements within the required timeframe.');
  return blocks;};

var oldSig=window.buildLoceSignatureBlocks;
window.buildLoceSignatureBlocks=function(d){return [BA('<p style="font-weight:700;margin-top:16px">ACCEPTANCE AND MANUAL SIGNING</p><p>By signing below, the Employee confirms that the complete Letter of Offer &amp; Contract of Employment and Appendix 1 have been reviewed, the offer is accepted, and the employment contract is agreed at the same time.</p><table class="l-sigtable" style="border:none"><tr style="border:none"><td style="border:none;width:50%;vertical-align:top;text-align:left">For and on behalf of the Employer<br><br><br><br><br>.....................................................<br>Name:<br>Designation:<br>Date:</td><td style="border:none;width:50%;vertical-align:top;text-align:left">Accepted and Signed by the Employee<br><br><br><br><br>.....................................................<br>Name:<br>NRIC/Passport No.:<br>Date:</td></tr></table>')];};

var oldAppendix=window.buildLoceAppendixBlocks;
window.buildLoceAppendixBlocks=function(d){var b=oldAppendix(d);if(d.jdReference){b.splice(1,0,B('<p style="font-size:10px;color:#555">JD Reference: <strong>'+e2(d.jdReference)+'</strong>'+(d.jdLevel?' · Level '+e2(d.jdLevel):'')+'</p>'));}return b;};

window.wrapLetterPage=function(pageInnerHtml,letterheadHtml,pageIndex,totalPages){var p=profile(),footer='<div class="letter-page-footer"><span>Ref: '+e2(p.prefix)+'-LOEC · Version 2.0 · Combined Letter of Offer &amp; Employment Contract</span><span>Page '+pageIndex+' of '+totalPages+'</span></div>';var pageContentHeight=PAGE_H_PX-PAGE_MARGIN_TOP_PX-PAGE_MARGIN_BOTTOM_PX;return '<div class="letter-page force-break" style="height:'+pageContentHeight+'px;position:relative;">'+letterheadHtml+pageInnerHtml+footer+'</div>';};

var oldGetLetterFileName=window.getLetterFileName;
window.getLetterFileName=function(){var d=gatherLoceData(),p=profile(),name=(d.name||'Employee').replace(/[^a-zA-Z0-9_-]+/g,'_');return p.prefix+'_LOEC_'+name+'_'+((byId('letterDate')||{}).value||new Date().toISOString().slice(0,10));};

var oldValidatePrint=window.validatePrint;
window.validatePrint=function(){var errs=oldValidatePrint();[['v2EmploymentType','Employment Type'],['v2ProbationMonths','Probation Period'],['v2ProbationNotice','Probation Notice'],['v2OtCategory','Statutory OT / Additional Work Category']].forEach(function(x){var el=byId(x[0]);if(el&&!String(el.value||'').trim())errs.push(markErr(el,x[1]+' is required for printing'));});if(byId('v2EmploymentType')&&byId('v2EmploymentType').value==='Fixed-Term Full-Time'&&!byId('v2FixedTermEnd').value)errs.push(markErr(byId('v2FixedTermEnd'),'Fixed-Term End Date is required'));return errs;};

// LOEC MANUAL SIGNING / RECORD PANEL ----------------------------------------
function installLoecRecordPanel(){
  if(byId('v2LoecPanel'))return;
  var office=byId('officeBox');if(!office)return;
  var panel=document.createElement('div');panel.id='v2LoecPanel';panel.className='v2-panel';panel.innerHTML='<h4>V2 — Combined LOEC Record & Manual Signing</h4><div id="v2LoecMessage" class="v2-warn">Open a submitted application to initialise its LOEC record.</div><div id="v2LoecBody" style="display:none">'
  +'<div class="v2-grid"><div><b>Document ID</b><div id="v2DocId">—</div></div><div><b>Status</b><div><span class="v2-status" id="v2LoecStatus">—</span></div></div><div class="form-group"><label>Employee Signed Date</label><input type="date" id="v2EmployeeSignedDate"></div><div class="form-group"><label>Employer Signed Date</label><input type="date" id="v2EmployerSignedDate"></div><div class="form-group"><label>Employer Signatory</label><input type="text" id="v2EmployerSignatory" value="Tan Mei Shy, Managing Director"></div><div class="form-group"><label>Physical Original Received</label><select id="v2PhysicalOriginal"><option value="false">No</option><option value="true">Yes</option></select></div><div class="form-group"><label>Physical Original Location</label><input type="text" id="v2PhysicalLocation" placeholder="e.g. HR Cabinet / Employee File"></div><div class="form-group"><label>Stamp Status</label><select id="v2StampStatus"><option value="pending">Pending</option><option value="submitted">Submitted</option><option value="stamped">Stamped</option><option value="not_required">Not Required</option></select></div><div class="form-group"><label>Stamp Due Date / HR Target</label><input type="date" id="v2StampDueDate"></div><div class="form-group"><label>Stamp Submission Date</label><input type="date" id="v2StampSubmittedDate"></div><div class="form-group"><label>Stamp Completed Date</label><input type="date" id="v2StampCompletedDate"></div><div class="form-group"><label>Stamp / LHDN Reference</label><input type="text" id="v2StampReference"></div></div>'
  +'<div id="v2Drift" style="display:none" class="v2-warn"></div><div id="v2LoecViewActions" class="v2-actions" style="display:none"><button id="v2ViewSignedLoecBtn" data-viewonly-allowed="1" class="secondary" onclick="v2ViewStoredLoecPdf(\'signed\')">View Signed LOEC PDF</button><button id="v2ViewStampCertificateBtn" data-viewonly-allowed="1" class="secondary" onclick="v2ViewStoredLoecPdf(\'stamp\')">View Stamp Certificate</button></div><div class="v2-actions"><button onclick="v2CreateLoecRecord()">Create / Refresh Draft Record</button><button class="warn" onclick="v2MarkLoecIssued()">Mark Issued & Freeze Snapshot</button><label style="display:inline-flex;align-items:center;background:#546e7a;color:#fff;border-radius:5px;padding:7px 10px;cursor:pointer">Upload Signed PDF<input type="file" id="v2SignedFile" accept="application/pdf" style="display:none" onchange="v2UploadSignedLoec(event)"></label><button class="good" onclick="v2VerifyLoec()">Verify Signed Agreement</button><label style="display:inline-flex;align-items:center;background:#6a1b9a;color:#fff;border-radius:5px;padding:7px 10px;cursor:pointer">Upload Stamp Certificate<input type="file" id="v2StampFile" accept="application/pdf" style="display:none" onchange="v2UploadStampCertificate(event)"></label><button class="good" onclick="v2SaveLoecMeta()">Save LOEC / Stamp Details</button><button class="secondary" onclick="v2NewLoecRevision()">Supersede → New Revision</button></div><div style="font-size:10px;color:#666;margin-top:8px">Signing method: <strong>Manual / wet ink</strong>. No electronic contract-signature function is used. Uploaded files are record copies and should correspond to the exact issued LOEC version.</div></div>';
  office.appendChild(panel);
}

function loecApi(path,opts){return apiFetch(path,opts||{}).catch(function(err){if(/relation .*eaf_loec_records|schema cache|404/i.test(err.message||'')){V2.loecRecordAvailable=false;showLoecSetupPending();}throw err;});}
function showLoecSetupPending(){var m=byId('v2LoecMessage'),b=byId('v2LoecBody');if(m){m.style.display='block';m.innerHTML='<strong>V2 database setup pending.</strong> Apply <code>supabase/migrations/001_meg_eaf_v2_loec.sql</code> and then <code>002_meg_eaf_v2_hardening.sql</code> in the V2 staging Supabase project to activate protected LOEC lifecycle, signed-document and stamp tracking.';}if(b)b.style.display='none';}
function termsSnapshot(){var d=collectFormData();var keep=['companyCode','approvedJobTitle','jobTitleLevel','jobTitleOther','finalSalary','v2FixedAllowance','v2OtherAllowance','finalFrom','finalTo','finalStart','finalDept','workLocation','workLocationOther','workLocationOtherText','reportingName','reportingTitle','v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','appendix1Text','v2JdId','v2JdReference'];var o={};keep.forEach(function(k){o[k]=d[k]===undefined?'':d[k];});return o;}
function snapshotString(x){try{return JSON.stringify(x||{});}catch(e){return '';}}
function v2DetectAgreementDrift(){var el=byId('v2Drift');if(!el||!V2.loecRecord||!V2.loecRecord.terms_snapshot||!['issued','signed_uploaded','verified','stamp_pending','stamped','completed'].includes(V2.loecRecord.status)){if(el)el.style.display='none';return;}var drift=snapshotString(V2.loecRecord.terms_snapshot)!==snapshotString(termsSnapshot());el.style.display=drift?'block':'none';if(drift)el.innerHTML='<strong>Issued agreement changed in the form.</strong> Do not silently overwrite the issued LOEC. Create a new revision before re-issuing.';}
function makeDocId(revision){var p=profile(),year=((byId('letterDate')||{}).value||new Date().toISOString().slice(0,10)).slice(0,4),suffix=String(currentAppId||Date.now()).replace(/-/g,'').slice(-8).toUpperCase();return p.prefix+'-LOEC-'+year+'-'+suffix+'-R'+String(revision||1);}

function v2ViewOnlyDenied(){
  if(window.isViewOnly && window.isViewOnly()){
    alert('This account has View Only permission. LOEC and employment records cannot be changed.');
    return true;
  }
  return false;
}
function v2ApplyLoecReadOnly(){
  if(!(window.isViewOnly && window.isViewOnly())) return;
  var panel=byId('v2LoecPanel'); if(!panel)return;
  panel.querySelectorAll('input,select,textarea,button').forEach(function(el){
    if(el.getAttribute('data-viewonly-allowed')==='1') return;
    el.disabled=true;
  });
  panel.querySelectorAll('label').forEach(function(el){if(el.querySelector('input[type=file]')){el.style.pointerEvents='none';el.style.opacity='.5';}});
  Array.prototype.forEach.call(panel.querySelectorAll('.v2-actions'),function(acts){
    if(acts.id!=='v2LoecViewActions')acts.style.display='none';
  });
  var m=byId('v2LoecMessage');
  if(m && V2.loecRecord){m.style.display='block';m.className='v2-ok';m.innerHTML='<strong>View only.</strong> LOEC record and available signed documents may be viewed; all record changes, uploads, verification and revisions are disabled.';}
}

window.v2CreateLoecRecord=function(){if(v2ViewOnlyDenied())return;if(!currentAppId){alert('Open a submitted application first.');return;}if(V2.loecRecord){if(V2.loecRecord.status!=='draft'){alert('This LOEC revision has already been issued or progressed. It cannot be reset to draft. Use Supersede → New Revision if contractual terms must change.');return;}return patchLoec({company_code:companyCode(),template_version:'2.0',jd_id:(resolvePosition().jdId||null),jd_reference:(resolvePosition().jdReference||null),terms_snapshot:termsSnapshot(),updated_by:USER_ID},'Draft LOEC record refreshed.');}var rev=1;var body={application_id:currentAppId,company_code:companyCode(),document_id:makeDocId(rev),revision:rev,template_version:'2.0',status:'draft',jd_id:(resolvePosition().jdId||null),jd_reference:(resolvePosition().jdReference||null),terms_snapshot:termsSnapshot(),updated_by:USER_ID};loecApi('/rest/v1/eaf_loec_records?on_conflict=application_id,revision',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)}).then(function(rows){V2.loecRecord=Array.isArray(rows)?rows[0]:body;renderLoecRecord();}).catch(function(err){if(V2.loecRecordAvailable)alert('Could not create LOEC record: '+err.message);});};
window.v2MarkLoecIssued=function(){if(v2ViewOnlyDenied())return;if(!V2.loecRecord){v2CreateLoecRecord();return;}if(V2.loecRecord.status!=='draft'){alert('Only a draft LOEC can be issued. This revision is already '+String(V2.loecRecord.status||'').replace(/_/g,' ')+'. Use Supersede → New Revision if contractual terms must change.');return;}var errs=typeof validatePrint==='function'?validatePrint():[];if(errs&&errs.length){if(typeof showErrors==='function')showErrors(errs);alert('Complete the required employment terms before issuing the LOEC.');return;}var patch={status:'issued',issued_at:new Date().toISOString(),terms_snapshot:termsSnapshot(),company_code:companyCode(),template_version:'2.0',jd_id:(resolvePosition().jdId||null),jd_reference:(resolvePosition().jdReference||null),updated_by:USER_ID};patchLoec(patch,'LOEC marked issued. The snapshot is now frozen for manual signing.');};
function patchLoec(patch,msg){if(v2ViewOnlyDenied())return;if(!V2.loecRecord||!V2.loecRecord.id){alert('Create the LOEC record first.');return;}loecApi('/rest/v1/eaf_loec_records?id=eq.'+encodeURIComponent(V2.loecRecord.id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(patch)}).then(function(rows){V2.loecRecord=rows&&rows[0]?rows[0]:Object.assign(V2.loecRecord,patch);renderLoecRecord();if(msg)alert(msg);}).catch(function(err){if(V2.loecRecordAvailable)alert('Could not update LOEC record: '+err.message);});}
function storageUpload(file,path){var h={'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SESSION.access_token,'Content-Type':file.type||'application/pdf','x-upsert':'false'};return fetch(SUPABASE_URL+'/storage/v1/object/eaf-loec/'+path,{method:'POST',headers:h,body:file}).then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t||('HTTP '+r.status));});return r.json();});}
function storageViewPdf(path){
  if(!path||!SESSION||!SESSION.access_token)return Promise.reject(new Error('Document is not available.'));
  var safe=String(path).split('/').map(encodeURIComponent).join('/');
  var h={'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SESSION.access_token};
  return fetch(SUPABASE_URL+'/storage/v1/object/authenticated/eaf-loec/'+safe,{method:'GET',headers:h}).then(function(r){
    if(!r.ok)return r.text().then(function(t){throw new Error(t||('HTTP '+r.status));});
    return r.blob();
  }).then(function(blob){
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
  });
}
window.v2ViewStoredLoecPdf=function(kind){
  if(!V2.loecRecord){alert('No LOEC record is available for this application.');return;}
  var path=kind==='stamp'?V2.loecRecord.stamp_certificate_path:V2.loecRecord.signed_copy_path;
  if(!path){alert(kind==='stamp'?'No stamp certificate has been stored for this LOEC.':'No signed LOEC PDF has been stored for this application.');return;}
  storageViewPdf(path).catch(function(err){alert('Could not open the document: '+err.message);});
};
function laterSignedDate(){var a=(byId('v2EmployeeSignedDate')||{}).value||'',b=(byId('v2EmployerSignedDate')||{}).value||'';return a&&b?(a>b?a:b):(a||b);}
function suggestStampDueDate(){var x=laterSignedDate();if(!x)return '';var d=new Date(x+'T00:00:00');if(isNaN(d.getTime()))return '';d.setDate(d.getDate()+30);return d.toISOString().slice(0,10);}
window.v2UploadSignedLoec=function(ev){if(v2ViewOnlyDenied()){if(ev&&ev.target)ev.target.value='';return;}var f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;if(!V2.loecRecord){alert('Create and issue the LOEC record before upload.');return;}if(V2.loecRecord.signed_copy_path){alert('A signed LOEC is already stored for this revision and cannot be overwritten. Supersede this revision if a replacement agreement is required.');return;}if(V2.loecRecord.status!=='issued'){alert('Mark the LOEC as issued before uploading the signed copy.');return;}if(f.type!=='application/pdf'){alert('Please upload the signed agreement as PDF.');return;}var es=(byId('v2EmployeeSignedDate')||{}).value||'',ms=(byId('v2EmployerSignedDate')||{}).value||'',sig=((byId('v2EmployerSignatory')||{}).value||'').trim();if(!es||!ms||!sig){alert('Enter the Employee Signed Date, Employer Signed Date and Employer Signatory before uploading the signed agreement.');return;}var due=(byId('v2StampDueDate')||{}).value||suggestStampDueDate()||null;var path=companyCode()+'/'+new Date().getFullYear()+'/'+V2.loecRecord.document_id+'/SIGNED.pdf';storageUpload(f,path).then(function(){patchLoec({signed_copy_path:path,status:'signed_uploaded',signed_uploaded_at:new Date().toISOString(),employee_signed_date:es,employer_signed_date:ms,employer_signatory:sig,stamp_due_date:due,updated_by:USER_ID},'Signed LOEC PDF uploaded. HR verification is still required.');}).catch(function(err){alert('Upload failed. The signed record is immutable once stored; if this revision already contains a file, create a new revision. Details: '+err.message);});};
window.v2VerifyLoec=function(){if(v2ViewOnlyDenied())return;if(!V2.loecRecord||!V2.loecRecord.signed_copy_path){alert('Upload the signed PDF first.');return;}if(V2.loecRecord.status!=='signed_uploaded'){alert('Only a newly uploaded signed agreement can move to HR verification. Current status: '+String(V2.loecRecord.status||'').replace(/_/g,' ')+'.');return;}if(!confirm('Confirm that HR has checked: correct LOEC version, employee signature, employer signature and complete pages?'))return;patchLoec({status:'stamp_pending',verified_at:new Date().toISOString(),verified_by:USER_ID,updated_by:USER_ID},'Signed agreement verified. Stamp tracking is now active.');};
window.v2UploadStampCertificate=function(ev){if(v2ViewOnlyDenied()){if(ev&&ev.target)ev.target.value='';return;}var f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;if(!V2.loecRecord){alert('Create the LOEC record first.');return;}if(V2.loecRecord.stamp_certificate_path){alert('A stamp certificate is already stored for this revision and cannot be overwritten.');return;}if(!['verified','stamp_pending','stamped','completed'].includes(V2.loecRecord.status)){alert('HR must verify the manually signed LOEC before the stamp certificate is uploaded.');return;}if(f.type!=='application/pdf'){alert('Please upload the stamp certificate as PDF.');return;}var path=companyCode()+'/'+new Date().getFullYear()+'/'+V2.loecRecord.document_id+'/STAMP_CERTIFICATE.pdf';storageUpload(f,path).then(function(){patchLoec({stamp_certificate_path:path,stamp_status:'stamped',stamp_completed_date:new Date().toISOString().slice(0,10),status:'completed',updated_by:USER_ID},'Stamp certificate uploaded. LOEC record marked completed.');}).catch(function(err){alert('Upload failed: '+err.message);});};
window.v2SaveLoecMeta=function(){if(v2ViewOnlyDenied())return;if(!V2.loecRecord){alert('Create the LOEC record first.');return;}var stamp=(byId('v2StampStatus')||{}).value||'pending';var status=V2.loecRecord.status;var isVerified=!!V2.loecRecord.verified_at||['verified','stamp_pending','stamped','completed'].includes(status);var submitted=(byId('v2StampSubmittedDate')||{}).value||null,completed=(byId('v2StampCompletedDate')||{}).value||null;if(isVerified&&(stamp==='pending'||stamp==='submitted'))status='stamp_pending';if(isVerified&&(stamp==='stamped'||stamp==='not_required'))status='completed';if(stamp==='submitted'&&!submitted)submitted=new Date().toISOString().slice(0,10);if(stamp==='stamped'&&!completed)completed=new Date().toISOString().slice(0,10);var signedLocked=!!V2.loecRecord.signed_copy_path;patchLoec({employee_signed_date:signedLocked?V2.loecRecord.employee_signed_date:((byId('v2EmployeeSignedDate')||{}).value||null),employer_signed_date:signedLocked?V2.loecRecord.employer_signed_date:((byId('v2EmployerSignedDate')||{}).value||null),employer_signatory:signedLocked?V2.loecRecord.employer_signatory:((byId('v2EmployerSignatory')||{}).value||null),physical_original_received:(byId('v2PhysicalOriginal')||{}).value==='true',physical_original_location:(byId('v2PhysicalLocation')||{}).value||null,stamp_status:stamp,stamp_due_date:(byId('v2StampDueDate')||{}).value||null,stamp_submitted_date:submitted,stamp_completed_date:completed,stamp_reference:(byId('v2StampReference')||{}).value||null,status:status,updated_by:USER_ID},'LOEC / stamp details saved.');};
function fallbackNewLoecRevision(old,body){if(v2ViewOnlyDenied())return Promise.reject(new Error('View Only permission'));return loecApi('/rest/v1/eaf_loec_records',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(body)}).then(function(rows){var created=rows&&rows[0]?rows[0]:body;return loecApi('/rest/v1/eaf_loec_records?id=eq.'+encodeURIComponent(old.id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({status:'superseded',superseded_at:new Date().toISOString(),updated_by:USER_ID})}).then(function(){V2.loecRecord=created;renderLoecRecord();return created;}).catch(function(err){if(created&&created.id){return loecApi('/rest/v1/eaf_loec_records?id=eq.'+encodeURIComponent(created.id),{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify({status:'cancelled',updated_by:USER_ID})}).catch(function(){}).then(function(){throw err;});}throw err;});});}
window.v2NewLoecRevision=function(){if(v2ViewOnlyDenied())return;if(!V2.loecRecord){v2CreateLoecRecord();return;}if(!confirm('Supersede the current LOEC record and create a new draft revision? The old record will remain in history.'))return;var old=V2.loecRecord;if(!old.id){alert('The current LOEC record is not saved yet.');return;}if(['superseded','cancelled'].includes(old.status)){alert('This LOEC revision is already closed. Reload the application to obtain the active revision.');return;}if(old.status==='draft'){alert('This LOEC is still a draft. Use Create / Refresh Draft Record instead of creating a new revision. Revisions are for agreements that have already been issued or progressed.');return;}var rev=(old.revision||1)+1,body={application_id:currentAppId,company_code:companyCode(),document_id:makeDocId(rev),revision:rev,template_version:'2.0',status:'draft',jd_id:(resolvePosition().jdId||null),jd_reference:(resolvePosition().jdReference||null),terms_snapshot:termsSnapshot(),updated_by:USER_ID};var rpcBody={p_old_loec_id:old.id,p_document_id:body.document_id,p_template_version:body.template_version,p_jd_id:body.jd_id,p_jd_reference:body.jd_reference,p_terms_snapshot:body.terms_snapshot};apiFetch('/rest/v1/rpc/eaf_v2_create_loec_revision',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(rpcBody)}).then(function(row){V2.loecRecord=Array.isArray(row)?row[0]:row;renderLoecRecord();}).catch(function(err){if(/function .*eaf_v2_create_loec_revision|schema cache|404/i.test(err.message||'')){return fallbackNewLoecRevision(old,body).catch(function(e){alert('Could not create a new LOEC revision: '+e.message);});}alert('Could not create a new LOEC revision: '+err.message);});};

function renderLoecRecord(){var m=byId('v2LoecMessage'),b=byId('v2LoecBody'),r=V2.loecRecord;if(!m||!b)return;if(!r){m.style.display='block';m.innerHTML='No V2 LOEC record yet. Complete the employment terms, generate/review the combined LOEC, then create its record.';b.style.display='none';return;}m.style.display='none';b.style.display='block';byId('v2DocId').textContent=r.document_id||'—';byId('v2LoecStatus').textContent=(r.status||'draft').replace(/_/g,' ').toUpperCase();byId('v2EmployeeSignedDate').value=r.employee_signed_date||'';byId('v2EmployerSignedDate').value=r.employer_signed_date||'';byId('v2EmployerSignatory').value=r.employer_signatory||'Tan Mei Shy, Managing Director';byId('v2PhysicalOriginal').value=String(!!r.physical_original_received);byId('v2PhysicalLocation').value=r.physical_original_location||'';byId('v2StampStatus').value=r.stamp_status||'pending';if(byId('v2StampDueDate'))byId('v2StampDueDate').value=r.stamp_due_date||'';byId('v2StampSubmittedDate').value=r.stamp_submitted_date||'';byId('v2StampCompletedDate').value=r.stamp_completed_date||'';byId('v2StampReference').value=r.stamp_reference||'';var locked=!!r.signed_copy_path||['signed_uploaded','verified','stamp_pending','stamped','completed'].includes(r.status);['v2EmployeeSignedDate','v2EmployerSignedDate','v2EmployerSignatory'].forEach(function(id){if(byId(id))byId(id).disabled=locked;});var due=byId('v2StampDueDate'),st=r.stamp_status||'pending';if(due&&due.value&&st!=='stamped'&&st!=='not_required'){var today=new Date().toISOString().slice(0,10);if(due.value<today)due.style.border='2px solid #c62828';else due.style.border='';}else if(due)due.style.border='';var va=byId('v2LoecViewActions');if(va){va.style.display=(r.signed_copy_path||r.stamp_certificate_path)?'flex':'none';}if(byId('v2ViewSignedLoecBtn'))byId('v2ViewSignedLoecBtn').style.display=r.signed_copy_path?'inline-flex':'none';if(byId('v2ViewStampCertificateBtn'))byId('v2ViewStampCertificateBtn').style.display=r.stamp_certificate_path?'inline-flex':'none';v2DetectAgreementDrift();v2ApplyLoecReadOnly();}
function v2LoadLoecRecord(){if(!currentAppId||!SESSION||!SESSION.access_token)return;loecApi('/rest/v1/eaf_loec_records?application_id=eq.'+encodeURIComponent(currentAppId)+'&status=neq.superseded&select=*&order=revision.desc&limit=1').then(function(rows){V2.loecRecord=rows&&rows[0]?rows[0]:null;renderLoecRecord();}).catch(function(err){if(V2.loecRecordAvailable)console.warn('V2 LOEC record unavailable:',err.message);});}

// Add company to detail header when application opens.
var oldShowDetail=window.showDetail;
window.showDetail=function(infoHtml){var c=companyObj();oldShowDetail('<span class="v2-chip">'+e2((c.name||companyCode()).replace(' Sdn. Bhd.',''))+'</span> &nbsp;'+infoHtml);setTimeout(v2LoadLoecRecord,50);};


// Build 16 — hourly remuneration, split working sessions, working-schedule footnote,
//              manual Appendices 2-4 and enhanced Office Use persistence.
var BUILD16_DEFAULT_APPENDICES={
  2:{title:'NORMAL WORKING HOURS SCHEDULE',intro:'',closing:'',tableEnabled:true,columns:['Applicable Schedule','Normal Working Days','Normal Hours','Total Hours Per Week'],rows:[['','','','']]},
  3:{title:'ADDITIONAL TERMS & CONDITIONS',intro:'',closing:'',tableEnabled:false,columns:['Term','Detail'],rows:[['','']]},
  4:{title:'ADDITIONAL TERMS & CONDITIONS',intro:'',closing:'',tableEnabled:false,columns:['Term','Detail'],rows:[['','']]}
};
function b16Clone(v){return JSON.parse(JSON.stringify(v));}
function b16TimeMinutes(t){if(!t||String(t).indexOf(':')<0)return null;var p=String(t).split(':'),h=parseInt(p[0],10),m=parseInt(p[1],10);if(!isFinite(h)||!isFinite(m))return null;return h*60+m;}
function b16SessionHours(from,to){var a=b16TimeMinutes(from),b=b16TimeMinutes(to);if(a===null||b===null)return 0;if(b<a)b+=1440;return Math.max(0,(b-a)/60);}
function b16FmtHours(n){return (isFinite(n)?n:0).toFixed(2);}
function b16PayBasis(){return (byId('v2PayBasis')||{}).value||'monthly';}
function b16Session2Enabled(){return !!((byId('v2Session2Enabled')||{}).checked);}
function b16WorkingHoursTextFromValues(s1f,s1t,s2e,s2f,s2t){
  var parts=[];
  if(s1f||s1t)parts.push('From '+e2(fmtTimeAmPm(s1f||''))+' to '+e2(fmtTimeAmPm(s1t||'')));
  if(s2e&&(s2f||s2t))parts.push('From '+e2(fmtTimeAmPm(s2f||''))+' to '+e2(fmtTimeAmPm(s2t||'')));
  return parts.join(' and ');
}
function b16CurrentDailyHours(){
  var h=b16SessionHours((byId('finalFrom')||{}).value,(byId('finalTo')||{}).value);
  if(b16Session2Enabled())h+=b16SessionHours((byId('v2Session2From')||{}).value,(byId('v2Session2To')||{}).value);
  return h;
}
function b16SyncPayUi(){
  var hourly=b16PayBasis()==='hourly',salary=byId('finalSalary');
  if(salary){var lab=salary.closest('.form-group')&&salary.closest('.form-group').querySelector('label');if(lab)lab.innerHTML=hourly?'Basic Hourly Rate (RM/hour) <span style="color:red">*</span>':'Final Approved Salary (RM/month) <span style="color:red">*</span>';salary.step='0.01';salary.min='0';}
  var words=byId('finalSalaryWords');if(words){var wlab=words.closest('.form-group')&&words.closest('.form-group').querySelector('label');if(wlab)wlab.innerHTML=(hourly?'Hourly Rate':'Salary')+' in Wording <span style="color:red">*</span> <span style="font-weight:400;color:#888">(auto-generated, editable)</span>';}
  var title=byId('v2RemunerationTitle');if(title)title.textContent=hourly?'V2 — Hourly Remuneration':'V2 — Fixed Monthly Remuneration';
  var basicLab=byId('v2BasicMirrorLabel');if(basicLab)basicLab.textContent=hourly?'Basic Hourly Rate':'Basic Salary';
  var totalLab=byId('v2TotalFixedLabel');if(totalLab)totalLab.textContent=hourly?'Total Fixed Monthly Allowances':'Total Fixed Monthly Remuneration';
  var hint=byId('v2PayBasisHint');if(hint)hint.innerHTML=hourly?'<strong>Hourly basis:</strong> the value above is an hourly rate, not a monthly salary. Fixed contractual allowances below remain monthly amounts if used.':'<strong>Monthly basis:</strong> basic salary and fixed contractual allowances form the fixed monthly remuneration.';
  var s2=byId('v2Session2Wrap');if(s2)s2.style.display=b16Session2Enabled()?'grid':'none';
  var total=byId('v2DailyHours');if(total)total.value=b16FmtHours(b16CurrentDailyHours())+' hours';
  var pay=byId('v2IndicativeDailyPay');if(pay){var rate=parseFloat((byId('finalSalary')||{}).value||0)||0;pay.value=hourly?fmtMoney(rate*b16CurrentDailyHours()):'—';}
  updateRemuneration();
}
function b16TermsChanged(){b16SyncPayUi();if(window.isAdmin)renderAppointmentLetter();v2DetectAgreementDrift();}

function b16AppendixCard(n){
  var d=BUILD16_DEFAULT_APPENDICES[n];
  return '<div class="b16-app-card" data-app="'+n+'">'
    +'<label class="b16-app-enable"><input type="checkbox" id="v2Appendix'+n+'Enabled"> Include Appendix '+n+'</label>'
    +'<div class="b16-app-body" id="v2Appendix'+n+'Body" style="display:none">'
    +'<div class="form-group"><label>Appendix '+n+' Title</label><input type="text" id="v2Appendix'+n+'Title" value="'+e2(d.title)+'"></div>'
    +'<div class="form-group"><label>Introductory / Explanatory Text</label><textarea id="v2Appendix'+n+'Intro" style="min-height:70px" placeholder="Optional paragraph before the table / terms"></textarea></div>'
    +'<label class="b16-table-toggle"><input type="checkbox" id="v2Appendix'+n+'TableEnabled" '+(d.tableEnabled?'checked':'')+'> Include editable table</label>'
    +'<div id="v2Appendix'+n+'TableTools" class="b16-table-tools"><button type="button" onclick="b16AddAppendixColumn('+n+')">+ Column</button><button type="button" onclick="b16RemoveAppendixColumn('+n+')">− Column</button><button type="button" onclick="b16AddAppendixRow('+n+')">+ Row</button><button type="button" onclick="b16RemoveAppendixRow('+n+')">− Row</button></div>'
    +'<div id="v2Appendix'+n+'TableHost" class="b16-table-host"></div>'
    +'<div class="form-group"><label>Acknowledgement / Closing Note</label><textarea id="v2Appendix'+n+'Closing" style="min-height:70px" placeholder="Optional acknowledgement or closing paragraph"></textarea></div>'
    +'</div></div>';
}
function b16RenderAppendixTable(n,data){
  var host=byId('v2Appendix'+n+'TableHost');if(!host)return;
  data=data||BUILD16_DEFAULT_APPENDICES[n];
  var cols=(data.columns&&data.columns.length?data.columns:['Column 1','Column 2']).slice(0,8),rows=(data.rows&&data.rows.length?data.rows:[cols.map(function(){return '';})]).slice(0,30);
  host.innerHTML='<table class="b16-edit-table"><thead><tr>'+cols.map(function(c,i){return '<th><input type="text" data-b16-col="'+i+'" value="'+e2(c)+'" aria-label="Column '+(i+1)+'"></th>';}).join('')+'</tr></thead><tbody>'
    +rows.map(function(row,ri){return '<tr>'+cols.map(function(c,ci){return '<td><textarea data-b16-row="'+ri+'" data-b16-cell="'+ci+'" aria-label="Row '+(ri+1)+' column '+(ci+1)+'">'+e2(row&&row[ci]||'')+'</textarea></td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
}
function b16ReadAppendixTable(n){
  var host=byId('v2Appendix'+n+'TableHost'),columns=[],rows=[];if(!host)return {columns:[],rows:[]};
  host.querySelectorAll('[data-b16-col]').forEach(function(x){columns.push(x.value||'');});
  host.querySelectorAll('tbody tr').forEach(function(tr){rows.push(Array.prototype.map.call(tr.querySelectorAll('textarea'),function(x){return x.value||'';}));});
  return {columns:columns,rows:rows};
}
function b16MutateAppendixTable(n,kind){
  var d=b16ReadAppendixTable(n),cols=d.columns.length?d.columns:['Column 1','Column 2'],rows=d.rows.length?d.rows:[['','']];
  if(kind==='addCol'&&cols.length<8){cols.push('Column '+(cols.length+1));rows.forEach(function(r){r.push('');});}
  if(kind==='removeCol'&&cols.length>1){cols.pop();rows.forEach(function(r){r.pop();});}
  if(kind==='addRow'&&rows.length<30)rows.push(cols.map(function(){return '';}));
  if(kind==='removeRow'&&rows.length>1)rows.pop();
  b16RenderAppendixTable(n,{columns:cols,rows:rows});b16TermsChanged();
}
window.b16AddAppendixColumn=function(n){b16MutateAppendixTable(n,'addCol');};window.b16RemoveAppendixColumn=function(n){b16MutateAppendixTable(n,'removeCol');};window.b16AddAppendixRow=function(n){b16MutateAppendixTable(n,'addRow');};window.b16RemoveAppendixRow=function(n){b16MutateAppendixTable(n,'removeRow');};
function b16CollectAppendices(){
  return [2,3,4].map(function(n){var t=b16ReadAppendixTable(n);return {number:n,enabled:!!((byId('v2Appendix'+n+'Enabled')||{}).checked),title:(byId('v2Appendix'+n+'Title')||{}).value||'',intro:(byId('v2Appendix'+n+'Intro')||{}).value||'',closing:(byId('v2Appendix'+n+'Closing')||{}).value||'',tableEnabled:!!((byId('v2Appendix'+n+'TableEnabled')||{}).checked),columns:t.columns,rows:t.rows};});
}
function b16RestoreAppendices(items){
  var map={};(Array.isArray(items)?items:[]).forEach(function(x){if(x&&x.number)map[Number(x.number)]=x;});
  [2,3,4].forEach(function(n){var src=map[n]||b16Clone(BUILD16_DEFAULT_APPENDICES[n]),en=byId('v2Appendix'+n+'Enabled'),body=byId('v2Appendix'+n+'Body'),te=byId('v2Appendix'+n+'TableEnabled');if(en)en.checked=!!src.enabled;if(body)body.style.display=en&&en.checked?'block':'none';if(byId('v2Appendix'+n+'Title'))byId('v2Appendix'+n+'Title').value=src.title||BUILD16_DEFAULT_APPENDICES[n].title;if(byId('v2Appendix'+n+'Intro'))byId('v2Appendix'+n+'Intro').value=src.intro||'';if(byId('v2Appendix'+n+'Closing'))byId('v2Appendix'+n+'Closing').value=src.closing||'';if(te)te.checked=src.tableEnabled!==false;b16RenderAppendixTable(n,src);b16ToggleAppendixTable(n);});
}
function b16ToggleAppendixTable(n){var on=!!((byId('v2Appendix'+n+'TableEnabled')||{}).checked),host=byId('v2Appendix'+n+'TableHost'),tools=byId('v2Appendix'+n+'TableTools');if(host)host.style.display=on?'block':'none';if(tools)tools.style.display=on?'flex':'none';}
function b16InstallAppendices(){
  if(byId('v2AdditionalAppendices'))return;var a1=byId('appendix1Text');if(!a1)return;var group=a1.closest('.form-group'),panel=document.createElement('div');panel.id='v2AdditionalAppendices';panel.className='v2-panel b16-app-panel';panel.innerHTML='<h4>Additional Contract Appendices (Appendix 2–4)</h4><div class="v2-warn" style="margin-bottom:10px">Optional. Use these for variable working schedules or other employment terms. Each enabled appendix becomes part of the same LOEC and its issued snapshot.</div>'+b16AppendixCard(2)+b16AppendixCard(3)+b16AppendixCard(4);group.parentNode.insertBefore(panel,group.nextSibling);
  [2,3,4].forEach(function(n){b16RenderAppendixTable(n,b16Clone(BUILD16_DEFAULT_APPENDICES[n]));var en=byId('v2Appendix'+n+'Enabled'),te=byId('v2Appendix'+n+'TableEnabled');if(en)en.addEventListener('change',function(){byId('v2Appendix'+n+'Body').style.display=this.checked?'block':'none';b16TermsChanged();});if(te)te.addEventListener('change',function(){b16ToggleAppendixTable(n);b16TermsChanged();});b16ToggleAppendixTable(n);});
}
function b16InstallFields(){
  if(byId('v2PayBasis'))return;
  var rem=byId('v2Remuneration');
  if(rem){var h=rem.querySelector('h4');if(h)h.id='v2RemunerationTitle';var grid=rem.querySelector('.v2-grid');if(grid){grid.insertAdjacentHTML('afterbegin','<div class="form-group"><label>Pay Basis <span style="color:red">*</span></label><select id="v2PayBasis"><option value="monthly">Monthly Salary</option><option value="hourly">Hourly Rate</option></select></div>');var bm=byId('v2BasicMirror');if(bm){var bl=bm.closest('.form-group').querySelector('label');if(bl)bl.id='v2BasicMirrorLabel';}var tf=byId('v2TotalFixed');if(tf){var tl=tf.closest('.form-group').querySelector('label');if(tl)tl.id='v2TotalFixedLabel';}rem.insertAdjacentHTML('beforeend','<div class="v2-warn" id="v2PayBasisHint" style="margin-top:8px"></div>');}}
  var remNode=byId('v2Remuneration'),schedule=document.createElement('div');schedule.id='v2WorkingSchedule';schedule.className='v2-panel';schedule.innerHTML='<h4>V2 — Working Schedule</h4><div class="v2-grid">'
    +'<div class="form-group"><label>Normal Working Days</label><input type="text" id="v2WorkingDays" placeholder="e.g. Monday to Friday"></div>'
    +'<div class="form-group"><label>Total Scheduled Hours / Day</label><input type="text" id="v2DailyHours" readonly></div>'
    +'<div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="v2Session2Enabled" style="width:15px;height:15px"> Add Working Hours Session 2</label></div>'
    +'<div class="form-group"><label>Indicative Scheduled Pay / Day</label><input type="text" id="v2IndicativeDailyPay" readonly></div>'
    +'</div><div id="v2Session2Wrap" class="v2-grid" style="margin-top:8px;display:none"><div class="form-group"><label>Session 2 — From</label><input type="time" id="v2Session2From"></div><div class="form-group"><label>Session 2 — To</label><input type="time" id="v2Session2To"></div></div>'
    +'<div class="form-group" style="margin-top:10px"><label>Working Hours / Days Footnote</label><textarea id="v2WorkingScheduleNote" style="min-height:70px" placeholder="e.g. Hours vary according to the student\'s school and tuition schedule (12.5 or 16.5 hours per week), as set out in Appendix 2."></textarea></div>';
  if(remNode)remNode.parentNode.insertBefore(schedule,remNode.nextSibling);
  var s1=byId('finalFrom');if(s1){var row=s1.closest('.form-group');var lab=row&&row.querySelector('label');if(lab)lab.innerHTML='Working Hours — Session 1 <span style="color:red">*</span>';}
  b16InstallAppendices();
  ['v2PayBasis','v2WorkingDays','v2Session2Enabled','v2Session2From','v2Session2To','v2WorkingScheduleNote'].forEach(function(id){var el=byId(id);if(el){el.addEventListener('input',b16TermsChanged);el.addEventListener('change',b16TermsChanged);}});
  if(byId('finalFrom')){byId('finalFrom').addEventListener('input',b16TermsChanged);byId('finalFrom').addEventListener('change',b16TermsChanged);}if(byId('finalTo')){byId('finalTo').addEventListener('input',b16TermsChanged);byId('finalTo').addEventListener('change',b16TermsChanged);}
  b16SyncPayUi();
}
var b15InsertV2EmploymentFields=insertV2EmploymentFields;
insertV2EmploymentFields=function(){b15InsertV2EmploymentFields();b16InstallFields();};

var b15UpdateRemuneration=updateRemuneration;
updateRemuneration=function(){
  var base=parseFloat((byId('finalSalary')||{}).value||0)||0,fa=parseFloat((byId('v2FixedAllowance')||{}).value||0)||0,oa=parseFloat((byId('v2OtherAllowance')||{}).value||0)||0,hourly=b16PayBasis()==='hourly';
  if(byId('v2BasicMirror'))byId('v2BasicMirror').value=hourly?(fmtMoney(base)+' / hour'):fmtMoney(base);
  if(byId('v2TotalFixed'))byId('v2TotalFixed').value=fmtMoney(hourly?(fa+oa):(base+fa+oa));
  var total=byId('v2DailyHours');if(total)total.value=b16FmtHours(b16CurrentDailyHours())+' hours';var pay=byId('v2IndicativeDailyPay');if(pay)pay.value=hourly?fmtMoney(base*b16CurrentDailyHours()):'—';
};

var b15CollectFormData=window.collectFormData;
window.collectFormData=function(){var d=b15CollectFormData();d.v2Schema='2.2';['v2PayBasis','v2Session2From','v2Session2To','v2WorkingDays','v2WorkingScheduleNote'].forEach(function(id){var el=byId(id);if(el)d[id]=el.value;});d.v2Session2Enabled=b16Session2Enabled();d.v2DailyHours=b16FmtHours(b16CurrentDailyHours());d.v2Appendices=b16CollectAppendices();return d;};
var b15RestoreFormData=window.restoreFormData;
window.restoreFormData=function(d){b15RestoreFormData(d||{});setTimeout(function(){var x=d||{};if(byId('v2PayBasis'))byId('v2PayBasis').value=x.v2PayBasis||'monthly';if(byId('v2Session2Enabled'))byId('v2Session2Enabled').checked=!!x.v2Session2Enabled;['v2Session2From','v2Session2To','v2WorkingDays','v2WorkingScheduleNote'].forEach(function(id){if(byId(id))byId(id).value=x[id]||'';});b16RestoreAppendices(x.v2Appendices||[]);b16SyncPayUi();},20);};

var b15GatherLoceData=window.gatherLoceData;
window.gatherLoceData=function(){var d=b15GatherLoceData(),hourly=b16PayBasis()==='hourly',s2=b16Session2Enabled(),s1f=(byId('finalFrom')||{}).value||'',s1t=(byId('finalTo')||{}).value||'',s2f=(byId('v2Session2From')||{}).value||'',s2t=(byId('v2Session2To')||{}).value||'';d.payBasis=hourly?'hourly':'monthly';d.hourlyRate=hourly?d.basicSalary:0;d.monthlySalary=hourly?0:d.basicSalary;d.workingDays=(byId('v2WorkingDays')||{}).value||'';d.workingScheduleNote=(byId('v2WorkingScheduleNote')||{}).value||'';d.session2Enabled=s2;d.session2From=s2f;d.session2To=s2t;d.totalDailyHours=b16CurrentDailyHours();d.workingHoursText=b16WorkingHoursTextFromValues(s1f,s1t,s2,s2f,s2t);d.appendices=b16CollectAppendices();return d;};

window.summarySalary=function(payload){var s=summaryField(payload,'finalSalary'),basis=summaryField(payload,'v2PayBasis')||'monthly';if(!s)return '';var n=parseFloat(s);var txt=isFinite(n)?n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}):s;return basis==='hourly'?('RM '+txt+'/hour'):('RM '+txt);};
window.summaryWorkingHours=function(payload){var f=summaryField(payload,'finalFrom'),t=summaryField(payload,'finalTo'),on=payload&&payload.v2Session2Enabled,f2=summaryField(payload,'v2Session2From'),t2=summaryField(payload,'v2Session2To'),parts=[];if(f||t)parts.push(f+' - '+t);if(on&&(f2||t2))parts.push(f2+' - '+t2);return parts.join('; ');};

var b15BuildPage1=window.buildLocePage1HTML;
window.buildLocePage1HTML=function(d){
  var c=d.company||companyObj(),p=d.entityProfile||profile(),fixed=d.employmentType==='Fixed-Term Full-Time'&&d.fixedTermEnd?'<tr><td>Employment Term</td><td>'+e2(d.employmentType)+' until '+e2(d.fixedTermEnd)+'</td></tr>':'<tr><td>Employment Type</td><td>'+e2(d.employmentType)+'</td></tr>';
  var payRows=d.payBasis==='hourly'?'<tr><td>Basic Hourly Rate</td><td>'+d.basicSalaryFmt+' per hour ('+e2(d.salaryWords)+')</td></tr>':'<tr><td>Basic Salary</td><td>'+d.basicSalaryFmt+' ('+e2(d.salaryWords)+')</td></tr>';
  if(d.fixedAllowance)payRows+='<tr><td>Fixed Contractual Allowance</td><td>'+d.fixedAllowanceFmt+' per month</td></tr>';if(d.otherAllowance)payRows+='<tr><td>Other Contractual Allowance</td><td>'+d.otherAllowanceFmt+' per month</td></tr>';if(d.payBasis!=='hourly')payRows+='<tr><td>Total Fixed Monthly Remuneration</td><td>'+d.totalFixedFmt+'</td></tr>';else if(d.fixedAllowance||d.otherAllowance)payRows+='<tr><td>Total Fixed Monthly Allowances</td><td>'+fmtMoney((d.fixedAllowance||0)+(d.otherAllowance||0))+'</td></tr>';
  var wh=e2(d.workingHoursText||workingHoursSalientText(d));if(d.workingScheduleNote)wh+='<br><small>'+e2(d.workingScheduleNote)+'</small>';
  return '<p class="letter-private">PRIVATE &amp; CONFIDENTIAL</p><p>'+d.letterDateFmt+'</p><div class="letter-tight" style="margin-top:10px"><p>'+d.name+'</p><p>'+d.ic+'</p>'+d.addrLines.map(function(l){return '<p>'+l+'</p>';}).join('')+'</div>'
    +'<p style="margin-top:14px">Dear '+d.title+' '+d.name+',</p><p class="l-clause-title" style="text-align:left;text-decoration:underline">LETTER OF OFFER &amp; CONTRACT OF EMPLOYMENT — '+(d.jobTitle||'').toUpperCase()+'</p>'
    +'<p>This Letter of Offer and Contract of Employment is made on <strong>'+d.letterDateFmt+'</strong> between:</p><p><strong>'+e2(c.name)+'</strong> (Company No.: <strong>'+e2(c.regNo)+'</strong>), a company incorporated in Malaysia with its registered address at <strong>'+e2(c.regAddress)+'</strong> ("the Employer"), and</p>'
    +'<p><strong>'+d.name+'</strong> (NRIC/Passport No.: <strong>'+d.ic+'</strong>), of <strong>'+d.addrInline+'</strong> ("the Employee").</p><p><strong>This is one combined employment agreement.</strong> By signing it after reviewing the complete document and all included Appendices, the Employee accepts the offer of employment and agrees to the Employment Contract at the same time.</p>'
    +'<p>The Employer employs the Employee, and the Employee agrees to serve the Employer, on the following salient terms and conditions:</p><table class="l-salient"><tr><th style="width:42%">Salient Term</th><th>Detail</th></tr>'
    +'<tr><td>a. Job Title</td><td>'+d.jobTitle+(d.jdReference?'<br><small>JD Ref: '+e2(d.jdReference)+(d.jdLevel?' · '+e2(d.jdLevel):'')+'</small>':'')+'</td></tr><tr><td>b. Commencement Date</td><td>'+d.startDateFmt+'</td></tr>'+fixed
    +'<tr><td>Probationary Period</td><td>'+e2(d.probationMonths||'—')+' month(s)</td></tr>'+payRows
    +(d.workingDays?'<tr><td>Normal Working Days</td><td>'+e2(d.workingDays)+'</td></tr>':'')+'<tr><td>Working Hours</td><td>'+wh+'</td></tr><tr><td>Normal Off Day / Rest Day</td><td>'+e2(p.offDay)+' / '+e2(p.restDay)+'</td></tr><tr><td>Place of Work</td><td>'+d.workLocation+'</td></tr><tr><td>Reporting Personnel</td><td>'+d.reportingName+'</td></tr></table>';
};
var b15BuildClauses=window.buildLoceClauseBlocks;
window.buildLoceClauseBlocks=function(d){var blocks=b15BuildClauses(d),schedule=(d.workingHoursText||'the agreed working schedule'),days=d.workingDays?(' on '+d.workingDays):'',note=d.workingScheduleNote?(' '+d.workingScheduleNote):'';blocks.forEach(function(b){if(!b||!b.html)return;if(b.html.indexOf('<div class="l-num">5.1</div>')>=0)b.html=C('5.1','The Employee’s normal working schedule is '+schedule+days+', subject to the statutory working-time framework and genuine meal/rest periods during which the Employee is free from duties.'+note).html;if(b.html.indexOf('<div class="l-num">6.1</div>')>=0){b.html=C('6.1',d.payBasis==='hourly'?'The Employee is paid a basic hourly rate of '+d.basicSalaryFmt+' per hour ('+d.salaryWords+'). Wages are calculated from authorised recorded working time and paid within the statutory deadline through an approved financial institution, less lawful deductions. Fixed contractual allowances, if any, are monthly amounts stated in the salient terms.':'The Employee is paid a basic salary of '+d.basicSalaryFmt+' ('+d.salaryWords+') per month. Fixed contractual allowance(s), if any, are stated in the salient terms. Wages are paid within the statutory deadline through an approved financial institution, less lawful deductions.').html;}if(b.html.indexOf('<div class="l-num">18.1</div>')>=0)b.html=C('18.1','This combined Letter of Offer & Contract of Employment, Appendix 1 Job Description, every additional Appendix expressly included in this agreement, the applicable Employee Handbook and incorporated written policies form the employment documentation.').html;});return blocks;};
window.buildLoceSignatureBlocks=function(d){return [BA('<p style="font-weight:700;margin-top:16px">ACCEPTANCE AND MANUAL SIGNING</p><p>By signing below, the Employee confirms that the complete Letter of Offer &amp; Contract of Employment and all included Appendices have been reviewed, the offer is accepted, and the employment contract is agreed at the same time.</p><table class="l-sigtable" style="border:none"><tr style="border:none"><td style="border:none;width:50%;vertical-align:top;text-align:left">For and on behalf of the Employer<br><br><br><br><br>.....................................................<br>Name:<br>Designation:<br>Date:</td><td style="border:none;width:50%;vertical-align:top;text-align:left">Accepted and Signed by the Employee<br><br><br><br><br>.....................................................<br>Name:<br>NRIC/Passport No.:<br>Date:</td></tr></table>')];};
function b16AppendixBlocks(a){
  var n=Number(a.number||0),blocks=[BH('<h3>APPENDIX '+n+' — '+e2((a.title||'ADDITIONAL TERMS & CONDITIONS').toUpperCase())+'</h3>')];
  String(a.intro||'').split(/\n\s*\n/).forEach(function(p){if(p.trim())blocks.push(B('<p>'+e2(p.trim()).replace(/\n/g,'<br>')+'</p>'));});
  if(a.tableEnabled&&Array.isArray(a.columns)&&a.columns.length){var rows=(a.rows||[]).filter(function(r){return Array.isArray(r)&&r.some(function(x){return String(x||'').trim();});});var chunkSize=7;if(!rows.length)rows=[a.columns.map(function(){return '';})];for(var start=0;start<rows.length;start+=chunkSize){var chunk=rows.slice(start,start+chunkSize),thead='<tr>'+a.columns.map(function(c){return '<th>'+e2(c||'')+'</th>';}).join('')+'</tr>',tbody=chunk.map(function(r){return '<tr>'+a.columns.map(function(c,i){return '<td>'+e2((r&&r[i])||'').replace(/\n/g,'<br>')+'</td>';}).join('')+'</tr>';}).join('');blocks.push(BA('<table class="b16-contract-table">'+thead+tbody+'</table>'));}}
  String(a.closing||'').split(/\n\s*\n/).forEach(function(p){if(p.trim())blocks.push(B('<p>'+e2(p.trim()).replace(/\n/g,'<br>')+'</p>'));});return blocks;
}
var b15BuildAppendices=window.buildLoceAppendixBlocks;
window.buildLoceAppendixBlocks=function(d){var blocks=b15BuildAppendices(d);(d.appendices||[]).filter(function(a){return a&&a.enabled;}).sort(function(a,b){return Number(a.number)-Number(b.number);}).forEach(function(a){blocks=blocks.concat(b16AppendixBlocks(a));});return blocks;};

var b15TermsSnapshot=termsSnapshot;
termsSnapshot=function(){var o=b15TermsSnapshot();var d=collectFormData();['v2PayBasis','v2Session2Enabled','v2Session2From','v2Session2To','v2WorkingDays','v2WorkingScheduleNote','v2DailyHours','v2Appendices'].forEach(function(k){o[k]=d[k]===undefined?'':d[k];});return o;};

var b15ValidatePrint=window.validatePrint;
window.validatePrint=function(){var errs=b15ValidatePrint();if(b16PayBasis()==='hourly'&&(!(parseFloat((byId('finalSalary')||{}).value)>0)))errs.push(markErr(byId('finalSalary'),'Basic Hourly Rate must be greater than zero'));if(b16Session2Enabled()&&(!(byId('v2Session2From')||{}).value||!(byId('v2Session2To')||{}).value))errs.push(markErr(byId('v2Session2From'),'Working Hours Session 2 requires both From and To times'));[2,3,4].forEach(function(n){if((byId('v2Appendix'+n+'Enabled')||{}).checked&&!String((byId('v2Appendix'+n+'Title')||{}).value||'').trim())errs.push(markErr(byId('v2Appendix'+n+'Title'),'Appendix '+n+' Title is required when the appendix is included'));});return errs;};

// Initialise V2 after V1 page setup.
var oldLoad=window.onload;
window.onload=function(){if(typeof oldLoad==='function')oldLoad();try{window.FORM_VERSION=V2.version;var f=byId('formRef');if(f)f.textContent=V2.version;var l=byId('loginVersionStamp');if(l)l.textContent=V2.version;addV2Styles();installDashboardCompanyFilter();insertV2EmploymentFields();installLoecRecordPanel();applyProfileDefaults(false);ensureSummaryCompanyColumn();}catch(e){console.error('MEG-EAF V2 HR extension:',e);}};

})();
