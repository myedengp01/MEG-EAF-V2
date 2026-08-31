/*
 * MEG-EAF V2 Applicant Extension — Build 04
 * General intended-post publishing + HR-internal JD level selection.
 * Applicants never receive exact JD levels/references through the public vacancy catalogue.
 */
(function(){
  'use strict';

  window.MEG_EAF_V2 = window.MEG_EAF_V2 || {};
  var V2 = window.MEG_EAF_V2;
  V2.version = 'MEG-EAF V2 Applicant v2026.08.31-04';
  V2.postFamilyCache = null;
  V2.pendingPosts = [];
  V2.pendingPostFamilyIds = [];
  V2.pendingOtherFamilyId = '';
  V2.pendingOtherSelection = '';
  V2.pendingOtherManual = '';

  function esc2(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function companies(){
    return (typeof EAF_COMPANIES!=='undefined' && EAF_COMPANIES) ? EAF_COMPANIES : (window.EAF_COMPANIES||{});
  }
  function company(){
    var code=(document.getElementById('companySelect')||{}).value||'meg';
    return companies()[code] || {name:'the selected Company',email:'HR'};
  }
  function sbPublicRpc(fn,args){
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return Promise.reject(new Error('Supabase is not configured'));
    return fetch(window.SUPABASE_URL+'/rest/v1/rpc/'+fn,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY},
      body:JSON.stringify(args||{})
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){throw new Error(t||('HTTP '+r.status));});
      return r.json();
    });
  }

  function loadPostFamilies(){
    if(V2.postFamilyCache) return Promise.resolve(V2.postFamilyCache);
    return sbPublicRpc('eaf_v2_public_post_families',{}).then(function(rows){
      V2.postFamilyCache=rows||[];
      return V2.postFamilyCache;
    });
  }

  function familiesForCompany(code,allRows){
    var rows=(allRows||[]).filter(function(r){return r.company_code===code;});
    // MyEden Edu Hub may share the MYEDEN JD architecture until a separate JD entity exists.
    if(code==='meh'&&!rows.length) rows=(allRows||[]).filter(function(r){return r.company_code==='meg';});
    return rows.slice().sort(function(a,b){return String(a.post_name||'').localeCompare(String(b.post_name||''));});
  }

  function wireOtherControls(){
    var cb=document.getElementById('postOtherCheck');
    var sel=document.getElementById('postOtherSelect');
    var manual=document.getElementById('postOtherDynamic');
    if(sel){
      sel.addEventListener('change',function(){
        if(sel.value){if(cb)cb.checked=true;if(manual)manual.value='';}
      });
    }
    if(manual){
      manual.addEventListener('input',function(){
        if(manual.value.trim()){if(cb)cb.checked=true;if(sel)sel.value='';}
      });
    }
  }

  function reapplyPendingSelections(){
    var selected=V2.pendingPosts||[];
    var ids=V2.pendingPostFamilyIds||[];
    var matched={};
    Array.prototype.forEach.call(document.querySelectorAll('input[name="post"][data-post-family-id]'),function(cb){
      if(selected.indexOf(cb.value)>=0 || ids.indexOf(cb.dataset.postFamilyId)>=0){cb.checked=true;matched[cb.value]=true;}
    });

    var otherCb=document.getElementById('postOtherCheck');
    var sel=document.getElementById('postOtherSelect');
    var manual=document.getElementById('postOtherDynamic');
    if(sel){
      var targetId=V2.pendingOtherFamilyId||'';
      if(targetId && Array.prototype.some.call(sel.options,function(o){return o.value===targetId;})) sel.value=targetId;
      else if(V2.pendingOtherSelection){
        var opt=Array.prototype.find.call(sel.options,function(o){return o.text===V2.pendingOtherSelection;});
        if(opt)sel.value=opt.value;
      }
    }
    if(manual)manual.value=V2.pendingOtherManual||'';

    // Build 03 draft compatibility: an old exact JD title becomes a preserved manual intention.
    var unmatched=selected.filter(function(x){return x && x.indexOf('Other /')!==0 && !matched[x];});
    if(unmatched.length && manual && !manual.value && !(sel&&sel.value)) manual.value=unmatched.join(', ');
    if((sel&&sel.value)||(manual&&manual.value)||selected.some(function(x){return x&&x.indexOf('Other /')===0;})){if(otherCb)otherCb.checked=true;}
  }

  function renderGeneralPosts(code,rows){
    var host=document.getElementById('postGroup');
    if(!host)return;
    var open=rows.filter(function(r){return !!r.is_open;});
    var closed=rows.filter(function(r){return !r.is_open;});
    var html='';

    if(open.length){
      html+='<div style="width:100%;font-weight:700;color:#1565c0;margin:8px 0 5px">Currently Recruiting</div>';
      open.forEach(function(r){
        html+='<label><input type="checkbox" name="post" value="'+esc2(r.post_name)+'" data-post-family-id="'+esc2(r.post_family_id)+'"> '+esc2(r.post_name)+'</label>';
      });
    }else{
      html+='<div style="width:100%;padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;color:#6d4c41;font-size:11px">No general posts are currently published for recruitment. You may still indicate another area of interest below.</div>';
    }

    html+='<div style="width:100%;font-weight:700;color:#666;margin:12px 0 5px">Other / Another Intended Post</div>';
    html+='<label style="width:100%;display:flex;align-items:center;gap:7px;flex-wrap:wrap">'
      +'<input type="checkbox" name="post" value="Other / Another intended post" id="postOtherCheck"> '
      +'<span>Choose another post:</span> '
      +'<select id="postOtherSelect" style="min-width:220px;padding:4px 6px;border:1px solid #aaa;border-radius:4px">'
      +'<option value="">-- Select unpublished post --</option>'
      +closed.map(function(r){return '<option value="'+esc2(r.post_family_id)+'">'+esc2(r.post_name)+'</option>';}).join('')
      +'</select>'
      +'<span>or type:</span> '
      +'<input type="text" id="postOtherDynamic" style="width:220px;border:none;border-bottom:1px solid #555" placeholder="Type intended position">'
      +'</label>';

    host.innerHTML=html;
    wireOtherControls();
    reapplyPendingSelections();
  }

  function loadCompanyPosts(code){
    var host=document.getElementById('postGroup');
    if(host)host.innerHTML='<div style="width:100%;padding:9px;color:#777">Loading intended posts for '+esc2(company().name)+'…</div>';
    return loadPostFamilies().then(function(allRows){
      renderGeneralPosts(code,familiesForCompany(code,allRows));
    }).catch(function(err){
      console.warn('MEG-EAF V2 general recruitment publishing unavailable:',err);
      if(host)host.innerHTML='<div style="width:100%;padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;color:#6d4c41;font-size:11px">Recruitment post list is temporarily unavailable. Please type your intended position below.</div>'
        +'<label style="width:100%"><input type="checkbox" name="post" value="Other / Another intended post" id="postOtherCheck"> Other: <input type="text" id="postOtherDynamic" style="width:220px;border:none;border-bottom:1px solid #555;margin-left:4px" placeholder="Type intended position"></label>';
      wireOtherControls();reapplyPendingSelections();
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
        if(!p.dataset.v2BaseHtml)p.dataset.v2BaseHtml=p.innerHTML;
        p.innerHTML=p.dataset.v2BaseHtml
          .replace(/Myeden Group Sdn Bhd \(\"the Company\"\)/gi,esc2(c.name)+' (\"the Company\")')
          .replace(/MyEden Group Sdn\. Bhd\. \(\"the Company\"\)/gi,esc2(c.name)+' (\"the Company\")');
      });
    }
    var success=document.querySelector('#successOverlay p');
    if(success)success.textContent='Thank you. Your application has been received by '+c.name+'. Our HR team will contact you regarding the next steps. You may now close this page.';
  }

  var oldCompanyChange=window.onEafCompanyChange;
  window.onEafCompanyChange=function(){
    if(typeof oldCompanyChange==='function')oldCompanyChange();
    var code=(document.getElementById('companySelect')||{}).value||'meg';
    updateCompanyText();
    loadCompanyPosts(code);
  };

  var oldCollect=window.collectFormData;
  window.collectFormData=function(){
    var d=oldCollect();
    d.v2Schema='2.0';
    d.v2RecruitmentSchema='general-post-family-v1';
    d.companyCode=(document.getElementById('companySelect')||{}).value||d.companyCode||'meg';
    d.selectedPostFamilyIds=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-post-family-id]'),function(x){return x.dataset.postFamilyId;});
    d.selectedPostFamilies=Array.prototype.map.call(document.querySelectorAll('input[name="post"]:checked[data-post-family-id]'),function(x){return x.value;});
    d.selectedJdIds=[];
    d.selectedJdRefs=[];

    var sel=document.getElementById('postOtherSelect');
    var manual=document.getElementById('postOtherDynamic');
    d.postOtherSelectedFamilyId=sel?sel.value:'';
    d.postOtherSelection=(sel&&sel.value)?sel.options[sel.selectedIndex].text:'';
    d.postOtherManual=manual?manual.value.trim():'';
    // Compatibility field used by older HR views.
    d.postOtherDynamic=d.postOtherManual||d.postOtherSelection||'';
    return d;
  };

  var oldRestore=window.restoreFormData;
  window.restoreFormData=function(d){
    d=d||{};
    V2.pendingPosts=(d.cb_post||[]).slice();
    V2.pendingPostFamilyIds=(d.selectedPostFamilyIds||[]).slice();
    V2.pendingOtherFamilyId=d.postOtherSelectedFamilyId||'';
    V2.pendingOtherSelection=d.postOtherSelection||'';
    V2.pendingOtherManual=d.postOtherManual||d.postOtherDynamic||d.postOther||d.postOtherOps||'';
    oldRestore(d);
    setTimeout(reapplyPendingSelections,300);
    setTimeout(reapplyPendingSelections,1000);
  };

  window.submitApplication=function(){
    var errs=validateDraft();
    if(errs.length>0){showErrors(errs);return;}
    clearErrors();
    var c=company();
    if(!confirm('Submit your application to '+c.name+'?\n\nPlease make sure all information is correct — the application cannot be changed after submission.'))return;
    var btn=document.getElementById('btnSubmit');
    btn.disabled=true;btn.textContent='Submitting...';
    var payload=collectFormData();
    fetch(SUPABASE_URL+'/rest/v1/eaf_applications',{
      method:'POST',headers:Object.assign(sbHeaders(),{'Prefer':'return=minimal'}),body:JSON.stringify({payload:payload})
    }).then(function(r){
      if(!r.ok){
        return r.text().then(function(txt){
          var body=null;try{body=JSON.parse(txt);}catch(e){}
          var msg=(body&&(body.message||body.hint))||('HTTP '+r.status);
          if(r.status===401||r.status===403||String(msg).toLowerCase().indexOf('policy')>-1)msg='your access link may have expired — please contact '+c.name+' HR';
          throw new Error(msg);
        });
      }
      if(window.DRAFT_CODE){sbRpc('delete_draft',{code:DRAFT_CODE}).catch(function(){});}
      try{localStorage.removeItem('meg_draft');localStorage.removeItem('meg_draft_code');localStorage.removeItem('meg_draft_time');}catch(e){}
      document.getElementById('successOverlay').style.display='flex';
    }).catch(function(err){
      alert('Submission failed: '+err.message+'.\nYour information is still on this page — nothing has been lost. Please try again, or save a draft and contact HR.');
    }).finally(function(){btn.disabled=false;btn.innerHTML='&#128228; Submit Application';});
  };

  var oldLoad=window.onload;
  window.onload=function(){
    if(typeof oldLoad==='function')oldLoad();
    try{
      window.FORM_VERSION=V2.version;
      var ref=document.getElementById('formRef');if(ref)ref.textContent=V2.version;
      updateCompanyText();
      window.onEafCompanyChange();
    }catch(e){console.warn('MEG-EAF V2 applicant extension:',e);}
  };
})();
