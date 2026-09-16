(function(global){
  'use strict';

  var BUILD = 'MEG-Employment & HR System V2 Stage 3B v2026.09.16-14:00';
  var ENTITY_ALIASES = {
    meg: ['meg','myeden group','myeden group sdn. bhd.'],
    meh: ['meh','myeden edu hub','myeden edu hub sdn. bhd.'],
    hds: ['hds','hd','happy dino','happy dino sdn. bhd.'],
    abn: ['abn','abp','aborne','aborne project','aborne project sdn. bhd.']
  };

  var FALLBACK = {
    meg: [
      {group:'A. Operations', positions:['Childcare Mentor','Kindergarten Teacher','Infant Childcare','Playgroup Mentor']},
      {group:'B. Office', positions:['Management','HR','Admin','Account','Account & Payroll','Content Creator','Marketing']}
    ],
    meh: [
      {group:'A. Education / Operations', positions:['Childcare Mentor','Kindergarten Teacher','Infant Childcare','Playgroup Mentor']},
      {group:'B. Office', positions:['Management','HR','Admin','Account','Account & Payroll','Content Creator','Marketing']}
    ],
    hds: [
      {group:'A. Camp Administration & Operations', positions:['Camp Administration & Operations Associate','Camp Administration & Operations Executive','Senior Camp Administration & Operations Executive']},
      {group:'B. Camp Operations & Logistics', positions:['Camp Operations & Logistics Associate','Camp Operations & Logistics Executive','Senior Camp Operations & Logistics Executive']},
      {group:'C. Management & Leadership', positions:['Happy Dino Project & Operations Manager','Head of Happy Dino / Head of Science Camp Projects']}
    ],
    abn: [
      {group:'A. Event & Administration', positions:['Event Admin']},
      {group:'B. Event & Project', positions:['Event Executive','Event Manager']},
      {group:'C. Sales & Business Development', positions:['Sales Executive']},
      {group:'D. Operations', positions:['Operations Executive']}
    ]
  };

  var FALLBACK_OTHER = {
    meg: {value:'Others (Office)', label:'Other position'},
    meh: {value:'Others (Office)', label:'Other position'},
    hds: {value:'Others (Happy Dino)', label:'Other Happy Dino position'},
    abn: {value:'Others (Aborne Project)', label:'Other Aborne position'}
  };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>\"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function companyCodeFromPayload(payload){ return (payload&&payload.companyCode)||'meg'; }
  function companyName(companies,code){ return companies&&companies[code] ? companies[code].name : code.toUpperCase(); }
  function shortCompanyName(companies,code){
    var n=companyName(companies,code);
    return n.replace(/\s+Sdn\.?\s*Bhd\.?/i,'').trim();
  }
  function currentChecked(container){
    if(!container) return [];
    return Array.from(container.querySelectorAll('input[name="post"]:checked')).map(function(x){return x.value;});
  }
  function otherText(container){
    var x=container&&container.querySelector('#postOther');
    return x ? x.value : '';
  }
  function groupPositions(rows,depts){
    var dm={}; (depts||[]).forEach(function(d){dm[d.id]=d.name||'Positions';});
    var groups={};
    (rows||[]).forEach(function(p){
      var g=dm[p.department_id]||'Positions';
      if(!groups[g]) groups[g]=[];
      groups[g].push(p.job_title);
    });
    return Object.keys(groups).sort().map(function(k){ return {group:k,positions:groups[k].sort()}; });
  }
  function renderPositions(container,code,groups,selected,source){
    if(!container) return;
    selected=selected||[];
    var html='';
    (groups||[]).forEach(function(g,idx){
      html+='<div style="width:100%;font-weight:700;color:'+(idx%2?'#1565c0':'#1b5e20')+';margin:'+(idx?'8':'2')+'px 0 4px">'+esc(g.group)+'</div>';
      (g.positions||[]).forEach(function(p){
        html+='<label><input type="checkbox" name="post" value="'+esc(p)+'" '+(selected.indexOf(p)>-1?'checked':'')+'> '+esc(p)+'</label>';
      });
    });
    var other=FALLBACK_OTHER[code]||FALLBACK_OTHER.meg;
    html+='<div style="width:100%;font-weight:700;color:#6a1b9a;margin:8px 0 4px">'+(groups&&groups.length?'Other':'Position')+'</div>';
    html+='<label style="width:100%"><input type="checkbox" name="post" value="'+esc(other.value)+'" '+(selected.indexOf(other.value)>-1?'checked':'')+'> '+esc(other.label)+': '
      +'<input type="text" id="postOther" style="width:220px;border:none;border-bottom:1px solid #555;margin-left:4px" placeholder="Type position title"></label>';
    html+='<input type="hidden" id="postOtherOps" value="">';
    html+='<div class="v2-position-source" style="width:100%;font-size:10px;color:#888;margin-top:5px">'+(source==='jd'?'Positions loaded from the approved JD register.':'Standard V2 position list. Approved JD register will be used when available.')+'</div>';
    container.innerHTML=html;
  }
  function findEntity(entities,companies,code){
    var wanted=norm(companyName(companies,code));
    var aliases=(ENTITY_ALIASES[code]||[]).map(norm);
    return (entities||[]).find(function(e){
      var en=norm(e.name), ec=norm(e.code);
      if(en===wanted) return true;
      return aliases.some(function(a){ return a && (en===a || ec===a || en.indexOf(a)>-1); });
    });
  }
  function sbHeaders(anonKey){ return {'apikey':anonKey,'Content-Type':'application/json'}; }
  async function fetchJdPositions(opts){
    if(!opts.supabaseUrl||!opts.anonKey) return null;
    var eRes=await fetch(opts.supabaseUrl+'/rest/v1/jd_entities?select=id,code,name',{headers:sbHeaders(opts.anonKey)});
    if(!eRes.ok) throw new Error('JD entity lookup unavailable');
    var entities=await eRes.json();
    var entity=findEntity(entities,opts.companies,opts.companyCode);
    if(!entity) return null;
    var q='?select=id,entity_id,department_id,job_title,reference,level,status&entity_id=eq.'+encodeURIComponent(entity.id)+'&order=department_id,level,job_title';
    var pRes=await fetch(opts.supabaseUrl+'/rest/v1/jd_positions'+q,{headers:sbHeaders(opts.anonKey)});
    if(!pRes.ok) throw new Error('JD position lookup unavailable');
    var rows=await pRes.json();
    rows=(rows||[]).filter(function(p){return !p.status || String(p.status).toLowerCase()==='approved';});
    var dRes=await fetch(opts.supabaseUrl+'/rest/v1/jd_departments?select=id,entity_id,name&entity_id=eq.'+encodeURIComponent(entity.id)+'&order=name',{headers:sbHeaders(opts.anonKey)});
    var depts=dRes.ok?await dRes.json():[];
    if(!rows.length) return null;
    return groupPositions(rows,depts);
  }
  function loadCompanyPositions(opts){
    var container=typeof opts.container==='string'?document.getElementById(opts.container):opts.container;
    var code=opts.companyCode||'meg';
    var selected=Array.isArray(opts.selectedPosts)?opts.selectedPosts:[];
    renderPositions(container,code,FALLBACK[code]||[],selected,'fallback');
    var other=container&&container.querySelector('#postOther'); if(other && opts.otherValue) other.value=opts.otherValue;
    return fetchJdPositions(opts).then(function(groups){
      if(!groups||!groups.length) return false;
      var keep=currentChecked(container);
      // Preserve restored values even if the asynchronous fetch finishes later.
      selected.forEach(function(v){ if(keep.indexOf(v)<0) keep.push(v); });
      var typed=otherText(container)||opts.otherValue||'';
      renderPositions(container,code,groups,keep,'jd');
      var o=container.querySelector('#postOther'); if(o) o.value=typed;
      return true;
    }).catch(function(){ return false; });
  }
  function setEntityText(companies,code){
    var name=companyName(companies,code);
    var rel=document.getElementById('relatedEmployeeLabel');
    if(rel) rel.textContent='Do you have any family/relatives/friends currently employed by '+name+'? If yes:';
    var decl=document.getElementById('entityDeclarationIntro');
    if(decl) decl.innerHTML='I hereby declare that all information given by me to the foregoing questions and all statements made by me in this application form are correct and to the best of my knowledge and belief. If there is any false declaration made in this application form, <strong>'+esc(name)+'</strong> ("the Company") has the absolute right to terminate my employment immediately.';
    var success=document.getElementById('entitySuccessText');
    if(success) success.textContent='Thank you. Your application has been received by '+name+'. Our HR team will contact you regarding the next steps. You may now close this page.';
    var help=document.getElementById('entityDraftHelp');
    if(help) help.textContent="Don't have a code? Contact the selected company's HR team and we will retrieve it for you. Loading a draft will replace anything currently entered on this form.";
  }
  function companyBadge(companies,code){ return shortCompanyName(companies,code); }

  global.V2Entity={
    build:BUILD,
    fallback:FALLBACK,
    companyCodeFromPayload:companyCodeFromPayload,
    companyName:companyName,
    shortCompanyName:shortCompanyName,
    companyBadge:companyBadge,
    loadCompanyPositions:loadCompanyPositions,
    setEntityText:setEntityText,
    currentChecked:currentChecked
  };
})(window);
