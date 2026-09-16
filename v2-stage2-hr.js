/*
 * MEG-Employment & HR System V2 — Stage 2 HR Employment Terms + JD Master Binding (Stage 3B management update)
 * Build: v2026.09.10-20:05
 *
 * Scope deliberately stops before Stage 3 LOEC refactor.
 * - Adds structured employment terms and remuneration fields to HR Office Use.
 * - Prefers approved, authenticated JD Master positions for the selected legal employer.
 * - Preserves MEG/MEH legacy fallback and the approved Happy Dino eight-role fallback.
 * - Stage 3B adds the Management-approved Aborne five-role fallback architecture.
 * - Persists Stage 2 fields in the existing application/draft payload for compatibility.
 * - Does NOT change LOEC clauses/rendering, signed-document workflow, stamp tracking,
 *   RLS, storage policies or production database schema.
 */
(function(global){
  'use strict';

  var S2 = global.MEG_EAF_V2_STAGE2 = global.MEG_EAF_V2_STAGE2 || {};
  S2.version = 'MEG-Employment & HR System V2 Stage 3B v2026.09.16-11:17';
  S2.jd = null;
  S2.jdState = 'fallback'; // fallback | loading | connected | unavailable
  S2.pendingRestore = null;
  S2.lastCompanyCode = '';

  var ENTITY_TERMS = {
    meg:{handbook:'MyEden Group Employee Handbook', defaultProbation:'3', defaultNotice:'4', noticeUnit:'weeks', offDay:'Saturday', restDay:'Sunday'},
    meh:{handbook:'MyEden Group Employee Handbook', defaultProbation:'3', defaultNotice:'4', noticeUnit:'weeks', offDay:'Saturday', restDay:'Sunday'},
    hds:{handbook:'Happy Dino Employee Handbook', defaultProbation:'3', defaultNotice:'4', noticeUnit:'weeks', offDay:'Saturday', restDay:'Sunday'},
    abn:{handbook:'Aborne Project Employee Handbook', defaultProbation:'3', defaultNotice:'4', noticeUnit:'weeks', offDay:'Saturday', restDay:'Sunday'}
  };
  var ENTITY_ALIASES = {
    meg:['meg','myeden group','myeden group sdn bhd','myeden group sdn. bhd.'],
    meh:['meh','myeden edu hub','myeden edu hub sdn bhd','myeden edu hub sdn. bhd.'],
    hds:['hds','happy dino','happy dino sdn bhd','happy dino sdn. bhd.'],
    abn:['abn','abp','aborne','aborne project','aborne project sdn bhd','aborne project sdn. bhd.']
  };

  function byId(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function code(){ var el=byId('companySelect'); return el&&el.value?String(el.value):'meg'; }
  function termsProfile(){ return ENTITY_TERMS[code()] || ENTITY_TERMS.meg; }
  function companyObj(){ try{ if(typeof EAF_COMPANIES!=='undefined') return EAF_COMPANIES[code()]||{}; }catch(e){} return (global.EAF_COMPANIES||{})[code()]||{}; }
  function money(v){ var n=parseFloat(v||0); if(!isFinite(n)) n=0; return 'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function optionExists(sel,value){ return !!sel && Array.prototype.some.call(sel.options,function(o){return String(o.value)===String(value);}); }
  function currentSelectedTitle(){ var p=resolveStage2Position(); return p&&p.title?p.title:''; }
  function isApproved(p){ return String((p&&p.status)||'').toLowerCase()==='approved'; }
  function companyName(){ var c=companyObj(); return c.name || code().toUpperCase(); }

  function installStyles(){
    if(byId('v2Stage2Style')) return;
    var st=document.createElement('style'); st.id='v2Stage2Style';
    st.textContent='\n'
      +'.v2s2-panel{border:1px solid #b7d8ee;background:#f7fbfe;border-radius:8px;padding:11px 12px;margin:10px 0 12px}\n'
      +'.v2s2-panel h4{margin:0 0 9px;color:#0d5d8f;font-size:13px}\n'
      +'.v2s2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}\n'
      +'.v2s2-note{font-size:10px;color:#5f6b73;line-height:1.45;margin-top:7px}\n'
      +'.v2s2-warn{background:#fff8e1;border-left:3px solid #f9a825;padding:7px 9px;font-size:10px;color:#6d4c00;margin-top:8px}\n'
      +'.v2s2-source{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;border-radius:999px;padding:4px 8px;background:#eef3f7;color:#546e7a;margin-left:6px}\n'
      +'.v2s2-source.ok{background:#e8f5e9;color:#2e7d32}.v2s2-source.warn{background:#fff8e1;color:#8d6e00}\n'
      +'@media(max-width:700px){.v2s2-grid{grid-template-columns:1fr}}\n';
    document.head.appendChild(st);
  }

  function insertEmploymentFields(){
    if(byId('v2EmploymentTerms')) return;
    var title=Array.prototype.find.call(document.querySelectorAll('#officeBox .section-title'),function(x){return x.textContent.indexOf('Appointment Letter Details')>=0;});
    if(!title) return;
    var p=document.createElement('div'); p.id='v2EmploymentTerms'; p.className='v2s2-panel';
    p.innerHTML='<h4>V2 Stage 2 — Employment Terms <span id="v2JdSource" class="v2s2-source warn">JD Master: fallback</span></h4>'
      +'<div class="v2s2-grid">'
      +'<div class="form-group"><label>Employment Type <span style="color:red">*</span></label><select id="v2EmploymentType"><option value="">-- HR selection required --</option><option value="Permanent Full-Time">Permanent Full-Time</option><option value="Fixed-Term Full-Time">Fixed-Term Full-Time</option><option value="Part-Time">Part-Time</option><option value="Temporary">Temporary</option><option value="Internship">Internship</option></select></div>'
      +'<div class="form-group" id="v2FixedTermWrap"><label>Fixed-Term End Date</label><input type="date" id="v2FixedTermEnd"></div>'
      +'<div class="form-group"><label>Probation Period (months) <span style="color:red">*</span></label><input type="number" min="0" max="24" step="1" id="v2ProbationMonths"></div>'
      +'<div class="form-group"><label>Probation Notice <span style="color:red">*</span></label><div style="display:flex;gap:6px"><input type="number" min="0" step="1" id="v2ProbationNotice" style="flex:1"><select id="v2ProbationNoticeUnit" style="flex:1"><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select></div></div>'
      +'<div class="form-group"><label>Statutory OT / Additional Work Category <span style="color:red">*</span></label><select id="v2OtCategory"><option value="">-- HR determination required --</option><option value="statutory_ot">Statutory OT eligible</option><option value="non_statutory">Non-statutory OT / Additional Work T&amp;C</option><option value="manual_prescribed">Manual employee / prescribed statutory category</option><option value="part_time">Part-time statutory arrangement</option><option value="other">Other approved category</option></select></div>'
      +'<div class="form-group"><label>Applicable Handbook</label><input type="text" id="v2Handbook" readonly></div>'
      +'<div class="form-group"><label>Normal Off Day</label><input type="text" id="v2OffDay" readonly></div>'
      +'<div class="form-group"><label>Normal Rest Day</label><input type="text" id="v2RestDay" readonly></div>'
      +'<div class="form-group"><label>JD Reference</label><input type="text" id="v2JdReference" readonly placeholder="Loaded from approved JD Master"></div>'
      +'</div><div id="v2ProbationHint" class="v2s2-warn"></div>'
      +'<div class="v2s2-note">Stage 2 captures structured HR employment terms for the next contract stage. It does not yet alter the current LOEC wording or issue workflow.</div>';
    title.parentNode.insertBefore(p,title.nextSibling);

    var salary=byId('finalSalary');
    if(salary){
      var row=salary.closest('.form-row');
      if(row){
        var r=document.createElement('div'); r.id='v2Remuneration'; r.className='v2s2-panel';
        r.innerHTML='<h4>V2 Stage 2 — Fixed Monthly Remuneration</h4><div class="v2s2-grid">'
          +'<div class="form-group"><label>Basic Salary</label><input type="text" id="v2BasicMirror" readonly></div>'
          +'<div class="form-group"><label>Fixed Contractual Allowance (RM)</label><input type="number" id="v2FixedAllowance" min="0" step="0.01" value="0"></div>'
          +'<div class="form-group"><label>Other Contractual Allowance (RM)</label><input type="number" id="v2OtherAllowance" min="0" step="0.01" value="0"></div>'
          +'<div class="form-group"><label>Total Fixed Monthly Remuneration</label><input type="text" id="v2TotalFixed" readonly></div>'
          +'</div><div class="v2s2-note">Variable claims or reimbursements remain separate unless expressly approved as contractual remuneration.</div>';
        row.parentNode.insertBefore(r,row.nextSibling);
      }
    }

    ['v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance'].forEach(function(id){
      var el=byId(id); if(!el) return;
      el.addEventListener('input',stage2TermsChanged);
      el.addEventListener('change',stage2TermsChanged);
    });
    if(salary){ salary.addEventListener('input',updateRemuneration); salary.addEventListener('change',updateRemuneration); }
  }

  function updateSourceBadge(){
    var el=byId('v2JdSource'); if(!el) return;
    var map={loading:'JD Master: loading',connected:'JD Master: connected',unavailable:'JD Master: unavailable — safe fallback',fallback:'JD Master: fallback'};
    el.textContent=map[S2.jdState]||map.fallback;
    el.className='v2s2-source '+(S2.jdState==='connected'?'ok':'warn');
  }

  function updateFixedTerm(){
    var type=byId('v2EmploymentType'),wrap=byId('v2FixedTermWrap'),end=byId('v2FixedTermEnd');
    if(!type||!wrap||!end) return;
    var fixed=type.value==='Fixed-Term Full-Time';
    wrap.style.opacity=fixed?'1':'.55';
    end.disabled=!fixed || (global.perm && !perm('can_edit_office_use'));
    if(!fixed) end.value='';
  }

  function updateRemuneration(){
    var base=parseFloat((byId('finalSalary')||{}).value||0)||0;
    var fixed=parseFloat((byId('v2FixedAllowance')||{}).value||0)||0;
    var other=parseFloat((byId('v2OtherAllowance')||{}).value||0)||0;
    if(byId('v2BasicMirror')) byId('v2BasicMirror').value=money(base);
    if(byId('v2TotalFixed')) byId('v2TotalFixed').value=money(base+fixed+other);
  }

  function applyEntityDefaults(force){
    var p=termsProfile();
    if(byId('v2Handbook')) byId('v2Handbook').value=p.handbook;
    if(byId('v2OffDay')) byId('v2OffDay').value=p.offDay;
    if(byId('v2RestDay')) byId('v2RestDay').value=p.restDay;
    if(byId('v2ProbationMonths') && (force || !byId('v2ProbationMonths').value)) byId('v2ProbationMonths').value=p.defaultProbation;
    if(byId('v2ProbationNotice') && (force || !byId('v2ProbationNotice').value)) byId('v2ProbationNotice').value=p.defaultNotice;
    if(byId('v2ProbationNoticeUnit') && (force || !byId('v2ProbationNoticeUnit').value)) byId('v2ProbationNoticeUnit').value=p.noticeUnit;
    var hint=byId('v2ProbationHint');
    if(hint){
      hint.innerHTML='Management-approved group probation defaults are prefilled for HR review and may be adjusted only for an authorised individual appointment.';
    }
    updateFixedTerm(); updateRemuneration(); updateSourceBadge();
  }

  function stage2TermsChanged(){ updateFixedTerm(); updateRemuneration(); try{ if(typeof global.scheduleAutoSave==='function') scheduleAutoSave(); }catch(e){} }

  // ---- Work location ------------------------------------------------------
  var oldPopulateWorkLocation=global.populateWorkLocationDropdown;
  global.populateWorkLocationDropdown=function(){
    var sel=byId('workLocation'); if(!sel) return;
    var current=sel.value, vals=[], c=companyObj();
    if(c.address) vals.push(c.address);
    if((code()==='meg'||code()==='meh') && Array.isArray(global.BRANCHES)){
      global.BRANCHES.forEach(function(x){ if(x && vals.indexOf(x)<0) vals.push(x); });
    }
    if(current && vals.indexOf(current)<0) vals.push(current); // preserve legacy stored location
    if(!vals.length && typeof oldPopulateWorkLocation==='function') return oldPopulateWorkLocation();
    sel.innerHTML='<option value="">-- Select work location --</option>'+vals.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>';}).join('');
    if(current && optionExists(sel,current)) sel.value=current;
  };

  // ---- JD Master ---------------------------------------------------------
  function deptById(id){ return S2.jd && (S2.jd.departments||[]).find(function(d){return String(d.id)===String(id);}) || null; }
  function entityById(id){ return S2.jd && (S2.jd.entities||[]).find(function(e){return String(e.id)===String(id);}) || null; }
  function jdById(id){ return S2.jd && (S2.jd.positions||[]).find(function(p){return String(p.id)===String(id);}) || null; }
  function findEntityId(companyCode){
    if(!S2.jd) return '';
    var aliases=(ENTITY_ALIASES[companyCode]||[]).map(norm), c=companyObj(), wanted=norm(c.name||'');
    var ent=(S2.jd.entities||[]).find(function(e){
      var en=norm(e.name), ec=norm(e.code);
      if(wanted && en===wanted) return true;
      return aliases.some(function(a){return a && (en===a || ec===a || en.indexOf(a)>-1);});
    });
    return ent?ent.id:'';
  }
  function approvedForCompany(){
    if(!S2.jd) return [];
    var eid=findEntityId(code()); if(!eid) return [];
    return (S2.jd.positions||[]).filter(function(p){return String(p.entity_id)===String(eid) && isApproved(p);}).slice().sort(function(a,b){
      var da=(deptById(a.department_id)||{}).name||'', db=(deptById(b.department_id)||{}).name||'';
      return da.localeCompare(db)||String(a.level||'').localeCompare(String(b.level||''),undefined,{numeric:true})||String(a.job_title||'').localeCompare(String(b.job_title||''));
    });
  }
  function responsesFor(pos){
    if(!pos||!S2.jd) return [];
    return (S2.jd.responsibilities||[]).filter(function(r){return String(r.position_id)===String(pos.id);}).slice().sort(function(a,b){return Number(a.sequence||0)-Number(b.sequence||0);}).map(function(r){return {k:r.title||'Responsibility',v:r.description||''};});
  }
  function hdsFallbackRows(){
    var levels={
      'camp administration & operations associate':'L1',
      'camp administration & operations executive':'L2',
      'senior camp administration & operations executive':'L3',
      'camp operations & logistics associate':'L1',
      'camp operations & logistics executive':'L2',
      'senior camp operations & logistics executive':'L3',
      'happy dino project & operations manager':'L4',
      'head of happy dino / head of science camp projects':'L5'
    };
    var groups=(global.V2Entity&&V2Entity.fallback&&V2Entity.fallback.hds)||[];
    var rows=[]; groups.forEach(function(g){(g.positions||[]).forEach(function(t){rows.push({title:t,group:g.group||'Happy Dino',level:levels[norm(t)]||''});});}); return rows;
  }
  function hdsFallbackByTitle(title){ return hdsFallbackRows().find(function(r){return norm(r.title)===norm(title);})||null; }
  function abnFallbackRows(){
    return [
      {title:'Event Admin',group:'Event & Administration',level:'L1',reportsTo:'Event Executive / Event Manager',purpose:'To provide reliable administrative and coordination support for events and projects, ensuring records, schedules, checklists and supporting documents are accurate, complete and ready for execution.',respItems:[
        {k:'Event Administration',v:'Prepare and maintain event files, schedules, attendance records, checklists and supporting documentation.'},
        {k:'Quotation / PO Support',v:'Prepare or organise approved quotation, purchase-order and supplier support documents.'},
        {k:'Supplier & Crew Records',v:'Maintain supplier, crew, contact and assignment records accurately.'},
        {k:'Client Information',v:'Update approved client/event information and escalate unclear or incomplete instructions.'},
        {k:'Event Preparation',v:'Prepare administrative materials, event checklists and readiness documents before each project.'},
        {k:'Post-Event Documentation',v:'Complete filing, outstanding-record follow-up and post-event administrative close-out.'}
      ]},
      {title:'Event Executive',group:'Event & Project',level:'L2',reportsTo:'Event Manager',purpose:'To execute assigned events from preparation through completion, coordinating clients, suppliers, crew, logistics and event-day requirements to approved quality, timing and cost expectations.',respItems:[
        {k:'Client Coordination',v:'Coordinate approved event requirements, schedules, deliverables and updates with clients.'},
        {k:'Supplier & Crew Coordination',v:'Coordinate suppliers, crew assignments, briefings and reporting times.'},
        {k:'Event Setup & Logistics',v:'Coordinate setup, materials, transport, venue and event-day logistics.'},
        {k:'Event-Day Execution',v:'Support or lead assigned event execution, timekeeping and issue escalation.'},
        {k:'Budget Awareness',v:'Work within approved quotations, budgets and authority limits and escalate variances promptly.'},
        {k:'Close-Out',v:'Complete post-event reports, records, outstanding follow-up and handover within required timelines.'}
      ]},
      {title:'Event Manager',group:'Event & Project',level:'L3',reportsTo:'Director / Management',purpose:'To own event and project delivery, profitability, quality and team execution from planning through financial close-out, while maintaining strong client, vendor and operational control.',respItems:[
        {k:'Project Planning',v:'Own project plans, schedules, milestones, resources and contingency requirements.'},
        {k:'Client Management',v:'Lead client communication, expectation management, escalations and service recovery.'},
        {k:'Budget & Profitability',v:'Control event budgets, approved expenditure, cost variance and project financial close-out.'},
        {k:'Manpower & Vendor Management',v:'Allocate manpower, coordinate vendors and monitor delivery against approved requirements.'},
        {k:'Risk & Event Command',v:'Lead event-day command, risk management, incident response and escalation.'},
        {k:'Team Leadership',v:'Supervise, coach and hold assigned event/project staff accountable for delivery and conduct.'}
      ]},
      {title:'Sales Executive',group:'Sales & Business Development',level:'L2',reportsTo:'Event Manager / Director',purpose:'To generate qualified enquiries and convert them into profitable event business through disciplined follow-up, proposals, quotations, presentations and effective handover to operations.',respItems:[
        {k:'Lead Generation',v:'Develop and follow up qualified prospects through approved channels.'},
        {k:'Proposal & Quotation',v:'Prepare proposals and quotations using approved pricing, scope and commercial controls.'},
        {k:'Client Presentation',v:'Present event solutions professionally and clarify client requirements.'},
        {k:'Pipeline Management',v:'Maintain accurate CRM/pipeline status, next actions and forecast information.'},
        {k:'Operations Handover',v:'Provide complete confirmed scope, client requirements and commercial details to the delivery team.'},
        {k:'Deposit / Payment Follow-Up',v:'Follow approved deposit and payment milestones and escalate overdue items promptly.'}
      ]},
      {title:'Operations Executive',group:'Operations',level:'L2',reportsTo:'Event Manager',purpose:'To ensure event logistics, manpower, equipment and operational readiness are controlled, accurate and available on time for safe and professional event execution.',respItems:[
        {k:'Equipment & Inventory',v:'Control equipment, inventory, issue/return records and loss or damage reporting.'},
        {k:'Venue & Logistics',v:'Coordinate venue access, transport, loading, delivery and logistics requirements.'},
        {k:'Supplier Coordination',v:'Coordinate operational suppliers and verify readiness against approved requirements.'},
        {k:'Manpower Deployment',v:'Coordinate manpower reporting, assignments, setup and teardown requirements.'},
        {k:'Operational Checklists',v:'Complete readiness and event-operation checklists accurately and on time.'},
        {k:'Incident Reporting',v:'Report operational incidents, shortages, damage, delays and corrective actions promptly.'}
      ]}
    ];
  }
  function abnFallbackByTitle(title){ return abnFallbackRows().find(function(r){return norm(r.title)===norm(title);})||null; }

  function loadJdMaster(){
    if(S2.jdState==='loading') return S2.loadingPromise || Promise.resolve(null);
    if(S2.jdState==='connected' && S2.jd) return Promise.resolve(S2.jd);
    if(!global.SESSION || !SESSION.access_token || typeof global.apiFetch!=='function') return Promise.resolve(null);
    S2.jdState='loading'; updateSourceBadge();
    S2.loadingPromise=Promise.all([
      apiFetch('/rest/v1/jd_entities?select=*&is_active=eq.true&order=display_order,name'),
      apiFetch('/rest/v1/jd_departments?select=*&is_active=eq.true&order=name'),
      apiFetch('/rest/v1/jd_positions?select=*&order=entity_id,department_id,level,job_title'),
      apiFetch('/rest/v1/jd_responsibilities?select=*&order=position_id,sequence')
    ]).then(function(a){
      S2.jd={entities:a[0]||[],departments:a[1]||[],positions:a[2]||[],responsibilities:a[3]||[]};
      S2.jdState='connected'; updateSourceBadge(); populateJobTitleDropdown(); applyStage2Restore();
      return S2.jd;
    }).catch(function(err){
      S2.jd=null; S2.jdState='unavailable'; updateSourceBadge(); populateJobTitleDropdown();
      console.warn('MEG-EAF V2 Stage 2 JD Master unavailable; using safe fallback:',err&&err.message?err.message:err);
      return null;
    });
    return S2.loadingPromise;
  }
  S2.loadJdMaster=loadJdMaster;

  var oldPopulateJob=global.populateJobTitleDropdown;
  global.populateJobTitleDropdown=function(){
    var sel=byId('approvedJobTitle'); if(!sel) return;
    var current=sel.value, rows=approvedForCompany();
    if(rows.length){
      var groups={}; rows.forEach(function(p){var d=(deptById(p.department_id)||{}).name||'Approved JD Positions';(groups[d]=groups[d]||[]).push(p);});
      var html='<option value="">-- Select approved job title --</option>';
      Object.keys(groups).sort().forEach(function(d){html+='<optgroup label="'+esc(d)+'">';groups[d].forEach(function(p){html+='<option value="jd:'+esc(p.id)+'">'+esc(p.job_title||'Untitled')+(p.level?' — '+esc(p.level):'')+(p.reference?' ['+esc(p.reference)+']':'')+'</option>';});html+='</optgroup>';});
      html+='<option value="__OTHER__">Other (manual HR entry)</option>';
      sel.innerHTML=html; if(optionExists(sel,current))sel.value=current; return;
    }
    if(code()==='hds'){
      var hs='<option value="">-- Select Happy Dino approved role --</option>';
      var groups2=(global.V2Entity&&V2Entity.fallback&&V2Entity.fallback.hds)||[];
      groups2.forEach(function(g){hs+='<optgroup label="'+esc(g.group||'Happy Dino')+'">';(g.positions||[]).forEach(function(t){var m=hdsFallbackByTitle(t);hs+='<option value="hdsfb:'+encodeURIComponent(t)+'">'+esc(t)+(m&&m.level?' — '+esc(m.level):'')+'</option>';});hs+='</optgroup>';});
      hs+='<option value="__OTHER__">Other (manual HR entry — JD approval required)</option>';
      sel.innerHTML=hs; if(optionExists(sel,current))sel.value=current; return;
    }
    if(code()==='abn'){
      var as='<option value="">-- Select Aborne approved role --</option>';
      var groups3=(global.V2Entity&&V2Entity.fallback&&V2Entity.fallback.abn)||[];
      groups3.forEach(function(g){as+='<optgroup label="'+esc(g.group||'Aborne Project')+'">';(g.positions||[]).forEach(function(t){var m=abnFallbackByTitle(t);as+='<option value="abnfb:'+encodeURIComponent(t)+'">'+esc(t)+(m&&m.level?' — '+esc(m.level):'')+'</option>';});as+='</optgroup>';});
      as+='<option value="__OTHER__">Other (manual HR entry — approval required)</option>';
      sel.innerHTML=as; if(optionExists(sel,current))sel.value=current; return;
    }
    if(typeof oldPopulateJob==='function'){ oldPopulateJob(); return; }
  };

  var oldResolve=global.resolvePosition;
  function resolveStage2Position(){
    var sel=byId('approvedJobTitle'), val=sel?String(sel.value||''):'';
    if(val.indexOf('jd:')===0){
      var p=jdById(val.slice(3));
      if(p && isApproved(p)){
        var d=deptById(p.department_id)||{};
        return {code:null,title:p.job_title||'',lvl:p.level||'',purpose:p.purpose||'',respItems:responsesFor(p),deptName:d.name||'',jdId:p.id,jdReference:p.reference||'',reportsTo:p.reports_to||'',employmentType:p.employment_type||'',location:p.location||''};
      }
    }
    if(val.indexOf('hdsfb:')===0){
      var title=''; try{ title=decodeURIComponent(val.slice(6)); }catch(e){ title=val.slice(6); }
      var fb=hdsFallbackByTitle(title);
      return {code:null,title:title,lvl:fb&&fb.level?fb.level:'',purpose:'',respItems:[],deptName:fb?fb.group:'Happy Dino',jdId:'',jdReference:'',fallbackApproved:true};
    }
    if(val.indexOf('abnfb:')===0){
      var at=''; try{ at=decodeURIComponent(val.slice(6)); }catch(e){ at=val.slice(6); }
      var af=abnFallbackByTitle(at);
      return {code:null,title:at,lvl:af&&af.level?af.level:'',purpose:af&&af.purpose?af.purpose:'',respItems:af&&af.respItems?af.respItems:[],deptName:af?af.group:'Aborne Project',jdId:'',jdReference:'',reportsTo:af&&af.reportsTo?af.reportsTo:'',fallbackApproved:true};
    }
    return typeof oldResolve==='function'?oldResolve():{code:null,title:'',lvl:'',purpose:'',respItems:[],deptName:''};
  }
  global.resolvePosition=resolveStage2Position;

  var oldJobChange=global.onJobTitleChange;
  var oldLevelChange=global.onLevelChange;
  global.onJobTitleChange=function(){
    var sel=byId('approvedJobTitle'), val=sel?String(sel.value||''):'', level=byId('jobTitleLevel'), otherWrap=byId('jobTitleOtherWrap');
    if(val.indexOf('jd:')===0){
      var p=jdById(val.slice(3)), d=p?deptById(p.department_id):null;
      if(otherWrap)otherWrap.style.display='none';
      if(level)level.innerHTML=p?'<option value="jd:'+esc(p.id)+'">'+esc((p.level||'Approved')+' — '+(p.job_title||''))+'</option>':'<option value="">-- Select level --</option>';
      if(byId('finalDept')&&d){byId('finalDept').value=d.name||'';byId('finalDept').dataset.auto='1';}
      if(byId('v2JdReference'))byId('v2JdReference').value=p?(p.reference||''):'';
      if(p&&byId('reportingTitle')&&!byId('reportingTitle').value&&p.reports_to)byId('reportingTitle').value=p.reports_to;
      if(p&&byId('v2EmploymentType')&&!byId('v2EmploymentType').value&&p.employment_type&&optionExists(byId('v2EmploymentType'),p.employment_type))byId('v2EmploymentType').value=p.employment_type;
      if(typeof oldLevelChange==='function')oldLevelChange(); updateFixedTerm(); return;
    }
    if(val.indexOf('hdsfb:')===0 || val.indexOf('abnfb:')===0){
      var rp=resolveStage2Position(); if(otherWrap)otherWrap.style.display='none';
      if(level)level.innerHTML='<option value="'+esc((rp.lvl||'')+'|'+rp.title)+'">'+esc((rp.lvl||'Approved')+' — '+rp.title)+(rp.lvl?'':' (level pending)')+'</option>';
      if(byId('finalDept')&&rp.deptName){byId('finalDept').value=rp.deptName;byId('finalDept').dataset.auto='1';}
      if(byId('reportingTitle')&&rp.reportsTo&&!byId('reportingTitle').value)byId('reportingTitle').value=rp.reportsTo;
      if(byId('v2JdReference'))byId('v2JdReference').value=rp.jdReference||'';
      if(typeof oldLevelChange==='function')oldLevelChange(); return;
    }
    if(typeof oldJobChange==='function') oldJobChange();
    if(code()==='abn' && val==='__OTHER__'){
      if(level)level.innerHTML='<option value="">-- Level pending approved Aborne JD --</option>';
      if(byId('v2JdReference'))byId('v2JdReference').value='';
      if(typeof oldLevelChange==='function')oldLevelChange();
    }
  };
  global.onLevelChange=function(){
    if(typeof oldLevelChange==='function')oldLevelChange();
    var p=resolveStage2Position();
    if(byId('v2JdReference'))byId('v2JdReference').value=p.jdReference||'';
  };

  // ---- Company change ----------------------------------------------------
  var oldCompanyChange=global.onEafCompanyChange;
  global.onEafCompanyChange=function(){
    var before=S2.lastCompanyCode||code();
    if(typeof oldCompanyChange==='function') oldCompanyChange.apply(this,arguments);
    var after=code(), changed=!!S2.lastCompanyCode && before!==after;
    S2.lastCompanyCode=after;
    if(changed){
      if(byId('v2EmploymentType'))byId('v2EmploymentType').value='';
      if(byId('v2FixedTermEnd'))byId('v2FixedTermEnd').value='';
      if(byId('v2OtCategory'))byId('v2OtCategory').value='';
      if(byId('v2FixedAllowance'))byId('v2FixedAllowance').value='0';
      if(byId('v2OtherAllowance'))byId('v2OtherAllowance').value='0';
    }
    applyEntityDefaults(changed);
    global.populateWorkLocationDropdown();
    global.populateJobTitleDropdown();
    if(changed){
      if(byId('approvedJobTitle'))byId('approvedJobTitle').value='';
      if(byId('jobTitleLevel'))byId('jobTitleLevel').innerHTML='<option value="">-- Select level --</option>';
      if(byId('jobTitleOther'))byId('jobTitleOther').value='';
      if(byId('jobTitleOtherWrap'))byId('jobTitleOtherWrap').style.display='none';
      if(byId('v2JdReference'))byId('v2JdReference').value='';
      if(byId('finalDept')&&byId('finalDept').dataset.auto==='1'){byId('finalDept').value='';}
      if(byId('appendixManual')&&!byId('appendixManual').checked&&byId('appendix1Text'))byId('appendix1Text').value='';
    }
  };

  // ---- Persistence -------------------------------------------------------
  var oldCollect=global.collectFormData;
  global.collectFormData=function(){
    var d=typeof oldCollect==='function'?oldCollect():{};
    d.v2Schema='2.0-stage2';
    ['v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance'].forEach(function(id){var el=byId(id);if(el)d[id]=el.value;});
    d.v2Handbook=(byId('v2Handbook')||{}).value||''; d.v2OffDay=(byId('v2OffDay')||{}).value||''; d.v2RestDay=(byId('v2RestDay')||{}).value||'';
    d.v2JdSource=S2.jdState; d.v2LegalEmployer=companyName();
    var p=resolveStage2Position();
    if(p&&p.title){
      d.v2ResolvedJobTitle=p.title||''; d.v2JdId=p.jdId||''; d.v2JdReference=p.jdReference||''; d.v2JdLevel=p.lvl||''; d.v2JdDepartment=p.deptName||'';
      d.approvedJobTitle=p.title||d.approvedJobTitle; d.jobTitleLevel=(p.lvl?String(p.lvl)+'|':'')+(p.title||'');
    } else { d.v2ResolvedJobTitle=''; d.v2JdId=''; d.v2JdReference=''; d.v2JdLevel=''; d.v2JdDepartment=''; }
    return d;
  };

  var oldRestore=global.restoreFormData;
  global.restoreFormData=function(d){
    S2.pendingRestore=d||{};
    if(typeof oldRestore==='function')oldRestore(d||{});
    setTimeout(applyStage2Restore,0); setTimeout(applyStage2Restore,450);
  };

  function selectRestoredPosition(d){
    var sel=byId('approvedJobTitle'); if(!sel) return false;
    var chosen='';
    if(S2.jd && d.v2JdId && optionExists(sel,'jd:'+d.v2JdId)) chosen='jd:'+d.v2JdId;
    if(!chosen && S2.jd && d.v2JdReference){
      var rp=approvedForCompany().find(function(p){return String(p.reference||'')===String(d.v2JdReference);}); if(rp&&optionExists(sel,'jd:'+rp.id))chosen='jd:'+rp.id;
    }
    if(!chosen && S2.jd){
      var title=d.v2ResolvedJobTitle||d.approvedJobTitle||'';
      var pt=approvedForCompany().find(function(p){return norm(p.job_title)===norm(title);}); if(pt&&optionExists(sel,'jd:'+pt.id))chosen='jd:'+pt.id;
    }
    if(!chosen && code()==='hds'){
      var ht=d.v2ResolvedJobTitle||d.approvedJobTitle||''; var fb=hdsFallbackByTitle(ht); if(fb){var v='hdsfb:'+encodeURIComponent(fb.title);if(optionExists(sel,v))chosen=v;}
    }
    if(!chosen && code()==='abn'){
      var at=d.v2ResolvedJobTitle||d.approvedJobTitle||''; var af=abnFallbackByTitle(at); if(af){var av='abnfb:'+encodeURIComponent(af.title);if(optionExists(sel,av))chosen=av;}
    }
    if(!chosen && optionExists(sel,d.approvedJobTitle)) chosen=d.approvedJobTitle;
    if(!chosen && (d.approvedJobTitle==='__OTHER__'||d.jobTitleOther)) chosen='__OTHER__';
    if(chosen){ sel.value=chosen; global.onJobTitleChange(); return true; }
    return false;
  }

  function applyStage2Restore(){
    var d=S2.pendingRestore||{};
    ['v2EmploymentType','v2FixedTermEnd','v2ProbationMonths','v2ProbationNotice','v2ProbationNoticeUnit','v2OtCategory','v2FixedAllowance','v2OtherAllowance'].forEach(function(id){if(byId(id)&&d[id]!==undefined)byId(id).value=d[id];});
    global.populateJobTitleDropdown(); selectRestoredPosition(d);
    if(byId('jobTitleOther')&&d.jobTitleOther!==undefined)byId('jobTitleOther').value=d.jobTitleOther;
    if(byId('finalDept')&&d.finalDept!==undefined&&d.finalDept!==''){byId('finalDept').value=d.finalDept;byId('finalDept').dataset.auto='0';}
    applyEntityDefaults(false); updateFixedTerm(); updateRemuneration();
  }

  // ---- Stage 2 validation hook (UI validation only; no LOEC refactor) -----
  var oldValidatePrint=global.validatePrint;
  global.validatePrint=function(){
    var errs=typeof oldValidatePrint==='function'?oldValidatePrint():[];
    if(global.isAdmin){
      var req=[['v2EmploymentType','Employment Type'],['v2ProbationMonths','Probation Period'],['v2ProbationNotice','Probation Notice'],['v2OtCategory','Statutory OT / Additional Work Category']];
      req.forEach(function(x){var el=byId(x[0]);if(el&&!String(el.value||'').trim()&&typeof global.markErr==='function')errs.push(markErr(el,x[1]+' is required for printing'));});
      var et=byId('v2EmploymentType'),fe=byId('v2FixedTermEnd');
      if(et&&et.value==='Fixed-Term Full-Time'&&fe&&!fe.value&&typeof global.markErr==='function')errs.push(markErr(fe,'Fixed-Term End Date is required for fixed-term employment'));
      if(code()==='abn' && (!S2.jd || !approvedForCompany().length) && byId('approvedJobTitle')){var abv=String(byId('approvedJobTitle').value||'');if(abv && abv.indexOf('abnfb:')!==0 && abv!=='__OTHER__' && typeof global.markErr==='function')errs.push(markErr(byId('approvedJobTitle'),'Select an approved Aborne fallback role or an authorised manual HR entry'));}
    }
    return errs;
  };

  // Keep conditional fixed-term field aligned after the base permission pass.
  var oldApplyFormPerms=global.applyFormPerms;
  if(typeof oldApplyFormPerms==='function'){
    global.applyFormPerms=function(){ oldApplyFormPerms.apply(this,arguments); updateFixedTerm(); };
  }

  // Load JD after authenticated profile is available.
  var oldLoadProfile=global.loadProfile;
  if(typeof oldLoadProfile==='function'){
    global.loadProfile=function(){
      return Promise.resolve(oldLoadProfile.apply(this,arguments)).then(function(x){ setTimeout(function(){loadJdMaster();},0); return x; });
    };
  }

  function init(){
    installStyles(); insertEmploymentFields(); S2.lastCompanyCode=code(); applyEntityDefaults(false);
    global.populateWorkLocationDropdown(); global.populateJobTitleDropdown(); updateSourceBadge();
    if(global.SESSION&&SESSION.access_token)loadJdMaster();
  }
  init();
})(window);
