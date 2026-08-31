/*
 * MEG-EAF V2 Applicant Extension
 * Multi-entity application behaviour + JD-driven vacancy catalogue.
 * Keeps V1 payload compatibility and does not alter production data schema.
 */
(function(){
  'use strict';

  window.MEG_EAF_V2 = window.MEG_EAF_V2 || {};
  var V2 = window.MEG_EAF_V2;
  V2.version = 'MEG-EAF V2 Applicant v2026.08.31-02';

  var COMPANY_ALIASES = {
    meg:['MyEden Group Sdn. Bhd.','MYEDEN Group Sdn. Bhd.','Myeden Group Sdn Bhd'],
    meh:['MyEden Edu Hub Sdn. Bhd.','MYEDEN Edu Hub Sdn. Bhd.'],
    hds:['Happy Dino Sdn. Bhd.','HAPPY DINO SDN. BHD.'],
    abn:['Aborne Project Sdn. Bhd.','ABORNE PROJECT SDN. BHD.']
  };

  var FALLBACK_POSTS = {
    meg:[
      ['Operations','Childcare Mentor'],['Operations','Kindergarten Teacher'],['Operations','Infant Childcare'],['Operations','Playgroup Mentor'],
      ['Office','Management'],['Office','HR'],['Office','Admin'],['Office','Account'],['Office','Account & Payroll'],['Office','Content Creator'],['Office','Marketing']
    ],
    meh:[
      ['Operations','Childcare Mentor'],['Operations','Kindergarten Teacher'],['Operations','Infant Childcare'],['Operations','Playgroup Mentor'],
      ['Office','Management'],['Office','HR'],['Office','Admin'],['Office','Account'],['Office','Account & Payroll'],['Office','Content Creator'],['Office','Marketing']
    ],
    hds:[
      ['Happy Dino','Camp Administration & Operations'],
      ['Happy Dino','Camp Operations & Logistics'],
      ['Happy Dino','Happy Dino Project & Operations Manager'],
      ['Happy Dino','Head of Happy Dino / Head of Science Camp Projects']
    ],
    // Aborne job titles are intentionally not assumed until its JD master is approved/populated.
    abn:[]
  };

  V2.publicJdCache = null;
  V2.pendingPosts = [];
  V2.pendingJdIds = [];

  function esc2(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function normalizeName(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function companies(){
    return (typeof EAF_COMPANIES!=='undefined' && EAF_COMPANIES) ? EAF_COMPANIES : (window.EAF_COMPANIES||{});
  }
  function company(){
    var code=(document.getElementById('companySelect')||{}).value||'meg';
    return companies()[code] || {name:'the selected Company',email:'HR'};
  }
  function sbPublic(path){
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return Promise.reject(new Error('Supabase is not configured'));
    return fetch(window.SUPABASE_URL+path,{headers:{'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY}})
      .then(function(r){ if(!r.ok) return r.text().then(function(t){throw new Error(t||('HTTP '+r.status));}); return r.json(); });
  }
  function sbPublicRpc(fn,args){
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return Promise.reject(new Error('Supabase is not configured'));
    return fetch(window.SUPABASE_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY},body:JSON.stringify(args||{})})
      .then(function(r){ if(!r.ok) return r.text().then(function(t){throw new Error(t||('HTTP '+r.status));}); return r.json(); });
  }

  function findEntityId(entities, code){
    var aliases=COMPANY_ALIASES[code]||[];
    var norms=aliases.map(normalizeName);
    var item=(entities||[]).find(function(e){return norms.indexOf(normalizeName(e.name))>=0;});
    if(!item && code==='meh'){
      // Edu Hub may deliberately share the MEG JD catalogue if no separate entity exists yet.
      var megNorms=(COMPANY_ALIASES.meg||[]).map(normalizeName);
      item=(entities||[]).find(function(e){return megNorms.indexOf(normalizeName(e.name))>=0;});
    }
    return item ? item.id : null;
  }

  function loadPublicJdData(){
    if(V2.publicJdCache) return Promise.resolve(V2.publicJdCache);
    return Promise.all([
      sbPublic('/rest/v1/jd_entities?select=id,name,is_active&is_active=eq.true&order=display_order,name'),
      sbPublic('/rest/v1/jd_departments?select=id,entity_id,name,is_active&is_active=eq.true&order=name'),
      sbPublic('/rest/v1/jd_positions?select=id,entity_id,department_id,job_title,level,reference,status&status=eq.approved&order=entity_id,department_id,level,job_title')
    ]).then(function(parts){
      V2.publicJdCache={entities:parts[0]||[],departments:parts[1]||[],positions:parts[2]||[]};
      return V2.publicJdCache;
    });
  }

  function renderPostsFromRows(code, rows, deptMap){
    var host=document.getElementById('postGroup');
    if(!host) return;
    var groups={};
    rows.forEach(function(p){
      var g=deptMap[p.department_id]||'Available Positions';
      (groups[g]||(groups[g]=[])).push(p);
    });
    var html='';
    Object.keys(groups).sort().forEach(function(g){
      html+='<div style="width:100%;font-weight:700;color:#1565c0;margin:8px 0 4px">'+esc2(g)+'</div>';
      groups[g].forEach(function(p){
        var label=p.job_title+(p.level?' ('+p.level+')':'');
        html+='<label><input type="checkbox" name="post" value="'+esc2(p.job_title)+'" data-jd-id="'+esc2(p.id)+'" data-jd-ref="'+esc2(p.reference||'')+'"> '+esc2(label)+'</label>';
      });
    });
    if(!rows.length){
      html+='<div style="width:100%;padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;color:#6d4c41;font-size:11px">No approved positions are currently published for this company in the JD master. You may still specify the position below.</div>';
    }
    html+='<div style="width:100%;font-weight:700;color:#666;margin:10px 0 4px">Other / Position not listed</div>';
    html+='<label style="width:100%"><input type="checkbox" name="post" value="Other / Position not listed" id="postOtherCheck"> Other: <input type="text" id="postOtherDynamic" style="width:210px;border:none;border-bottom:1px solid #555;margin-left:4px" placeholder="Type position"></label>';
    host.innerHTML=html;
    reapplyPendingSelections();
  }

  function renderFallbackPosts(code){
    var rows=(FALLBACK_POSTS[code]||[]).map(function(x,i){return {id:'fallback:'+code+':'+i,department_id:x[0],job_title:x[1],level:'',reference:''};});
    var deptMap={}; rows.forEach(function(r){deptMap[r.department_id]=r.department_id;});
    renderPostsFromRows(code,rows,deptMap);
  }

  function reapplyPendingSelections(){
    var selected=V2.pendingPosts||[];
    var ids=V2.pendingJdIds||[];
    Array.prototype.forEach.call(document.querySelectorAll('input[name="post"]'),function(cb){
      if(selected.indexOf(cb.value)>=0 || (cb.dataset.jdId && ids.indexOf(cb.dataset.jdId)>=0)) cb.checked=true;
    });
    var other=document.getElementById('postOtherDynamic');
    if(other && V2.pendingOtherPost!==undefined) other.value=V2.pendingOtherPost||'';
  }

  function loadPublishedVacancies(){
    if(V2.publishedVacancies) return Promise.resolve(V2.publishedVacancies);
    return sbPublicRpc('eaf_v2_public_positions',{}).then(function(rows){
      V2.publishedVacancies=rows||[]; return V2.publishedVacancies;
    });
  }

  function loadCompanyPosts(code){
    var host=document.getElementById('postGroup');
    if(host) host.innerHTML='<div style="width:100%;padding:9px;color:#777">Loading positions for '+esc2(company().name)+'…</div>';
    // V2 staging exposes only approved, applicant-safe vacancy fields through a narrow RPC.
    // If the migration/RPC is not available yet, fall back to the existing JD tables and finally to local compatibility lists.
    return loadPublishedVacancies().then(function(publicRows){
      var rows=(publicRows||[]).filter(function(r){return r.company_code===code;});
      if(code==='meh'&&!rows.length) rows=(publicRows||[]).filter(function(r){return r.company_code==='meg';});
      var deptMap={};
      var converted=rows.map(function(r,i){var did=code+'::'+(r.department||'Available Positions');deptMap[did]=r.department||'Available Positions';return {id:r.jd_id||('published:'+code+':'+i),department_id:did,job_title:r.job_title,level:r.level||'',reference:r.reference||''};});
      if(converted.length){renderPostsFromRows(code,converted,deptMap);return;}
      // A valid empty result means there are currently no approved vacancies for that entity.
      if(code==='abn'){renderPostsFromRows(code,[],{});return;}
      renderFallbackPosts(code);
    }).catch(function(){
      return loadPublicJdData().then(function(data){
        var eid=findEntityId(data.entities,code);
        if(!eid){ renderFallbackPosts(code); return; }
        var deptMap={}; data.departments.filter(function(d){return d.entity_id===eid;}).forEach(function(d){deptMap[d.id]=d.name;});
        var rows=data.positions.filter(function(p){return p.entity_id===eid;});
        renderPostsFromRows(code,rows,deptMap);
      }).catch(function(){ renderFallbackPosts(code); });
    });
  }

  function updateCompanyText(){
    var c=company();
    var relLabels=document.querySelectorAll('label');
    Array.prototype.forEach.call(relLabels,function(l){
      if(l.textContent.indexOf('family/relatives/friends currently employed by')>=0){
        var old=l.textContent;
        var prefix='Do you have any family/relatives/friends currently employed by ';
        if(old.indexOf(prefix)===0) l.childNodes[0].nodeValue=prefix+c.name+'? If yes:';
      }
    });
    var decl=document.querySelector('.declaration-box');
    if(decl){
      Array.prototype.forEach.call(decl.querySelectorAll('p'),function(p){
        if(!p.dataset.v2BaseHtml) p.dataset.v2BaseHtml=p.innerHTML;
        p.innerHTML=p.dataset.v2BaseHtml
          .replace(/Myeden Group Sdn Bhd \(\"the Company\"\)/gi,esc2(c.name)+' (\"the Company\")')
          .replace(/MyEden Group Sdn\. Bhd\. \(\"the Company\"\)/gi,esc2(c.name)+' (\"the Company\")');
      });
    }
    var success=document.querySelector('#successOverlay p');
    if(success) success.textContent='Thank you. Your application has been received by '+c.name+'. Our HR team will contact you regarding the next steps. You may now close this page.';
  }

  // Wrap company change without touching V1 branding logic.
  var oldCompanyChange=window.onEafCompanyChange;
  window.onEafCompanyChange=function(){
    if(typeof oldCompanyChange==='function') oldCompanyChange();
    var code=(document.getElementById('companySelect')||{}).value||'meg';
    updateCompanyText();
    loadCompanyPosts(code);
  };

  // Preserve V1 payload while adding JD identifiers + V2 metadata.
  var oldCollect=window.collectFormData;
  window.collectFormData=function(){
    var d=oldCollect();
    d.v2Schema='2.0';
    d.companyCode=(document.getElementById('companySelect')||{}).value||d.companyCode||'meg';
    d.selectedJdIds=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-jd-id]'),function(x){return x.dataset.jdId;});
    d.selectedJdRefs=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-jd-ref]'),function(x){return x.dataset.jdRef;}).filter(Boolean);
    var o=document.getElementById('postOtherDynamic'); d.postOtherDynamic=o?o.value:'';
    return d;
  };

  var oldRestore=window.restoreFormData;
  window.restoreFormData=function(d){
    d=d||{};
    V2.pendingPosts=(d.cb_post||[]).slice();
    V2.pendingJdIds=(d.selectedJdIds||[]).slice();
    V2.pendingOtherPost=d.postOtherDynamic||d.postOther||d.postOtherOps||'';
    oldRestore(d);
    setTimeout(reapplyPendingSelections,300);
    setTimeout(reapplyPendingSelections,1000);
  };

  // Dynamic submit message, still one application submission process.
  window.submitApplication=function(){
    var errs=validateDraft();
    if(errs.length>0){ showErrors(errs); return; }
    clearErrors();
    var c=company();
    if(!confirm('Submit your application to '+c.name+'?\n\nPlease make sure all information is correct — the application cannot be changed after submission.')) return;
    var btn=document.getElementById('btnSubmit');
    btn.disabled=true; btn.textContent='Submitting...';
    var payload=collectFormData();
    fetch(SUPABASE_URL+'/rest/v1/eaf_applications',{
      method:'POST',headers:Object.assign(sbHeaders(),{'Prefer':'return=minimal'}),body:JSON.stringify({payload:payload})
    }).then(function(r){
      if(!r.ok){
        return r.text().then(function(txt){
          var body=null; try{body=JSON.parse(txt);}catch(e){}
          var msg=(body&&(body.message||body.hint))||('HTTP '+r.status);
          if(r.status===401||r.status===403||String(msg).toLowerCase().indexOf('policy')>-1) msg='your access link may have expired — please contact '+c.name+' HR';
          throw new Error(msg);
        });
      }
      if(window.DRAFT_CODE){ sbRpc('delete_draft',{code:DRAFT_CODE}).catch(function(){}); }
      try{localStorage.removeItem('meg_draft');localStorage.removeItem('meg_draft_code');localStorage.removeItem('meg_draft_time');}catch(e){}
      document.getElementById('successOverlay').style.display='flex';
    }).catch(function(err){
      alert('Submission failed: '+err.message+'.\nYour information is still on this page — nothing has been lost. Please try again, or save a draft and contact HR.');
    }).finally(function(){btn.disabled=false;btn.innerHTML='&#128228; Submit Application';});
  };

  // Extend window.onload after the V1 initializer has been defined.
  var oldLoad=window.onload;
  window.onload=function(){
    if(typeof oldLoad==='function') oldLoad();
    try{
      window.FORM_VERSION=V2.version;
      var ref=document.getElementById('formRef'); if(ref) ref.textContent=V2.version;
      updateCompanyText();
      window.onEafCompanyChange();
    }catch(e){console.warn('MEG-EAF V2 applicant extension:',e);}
  };
})();
