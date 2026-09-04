/*
 * MEG-Employment & HR System V2 — Page Access Guard
 * Dashboard UVN: v2026.09.04-19:30
 * This file controls gateway entry only. It does NOT rename MEG-EAF V2 forms/LOEC.
 */
(function(){
  'use strict';

  var script = document.currentScript;
  var APP_CODE = script && script.getAttribute('data-eaf-app') || '';
  var SUPABASE_URL = 'https://vzngfswtofegimfcoigx.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_V5o_-Bkz5M7Y75j-eN03rQ_pkQ8Kem9';
  var SESSION_KEY = 'meg_hr_session';
  var CLIENT_INFO = 'MEG-EAF-V2-GATEWAY/v2026.09.04-19:30';
  var DASHBOARD_URL = 'dashboard.html';
  var session = null;
  var invitationToken = null;
  var invitationInfo = null;
  var invitationConsumed = false;

  function safeJson(text){ try{return text?JSON.parse(text):null;}catch(e){return null;} }
  function storeSession(s){ session=s; try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));}catch(e){} }
  function clearSession(){ session=null; try{sessionStorage.removeItem(SESSION_KEY);}catch(e){} }
  function loadSession(){ try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(e){return null;} }

  function reveal(){
    var pre=document.getElementById('megGatewayPrehide');
    if(pre && pre.parentNode) pre.parentNode.removeChild(pre);
    document.documentElement.style.visibility='visible';
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function renderBlocked(title,message,allowSignOut){
    function draw(){
      reveal();
      document.body.innerHTML=''
        +'<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#eef2fa;font-family:Segoe UI,Arial,sans-serif;color:#132043">'
        +'<div style="width:440px;max-width:100%;background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:30px;box-shadow:0 18px 50px rgba(20,40,80,.12);text-align:center">'
        +'<div style="font-size:38px;margin-bottom:12px">🔒</div>'
        +'<h2 style="margin:0 0 8px;font-size:22px">'+esc(title)+'</h2>'
        +'<p style="margin:0 0 22px;color:#627095;line-height:1.55">'+esc(message)+'</p>'
        +'<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'
        +'<button id="megGatewayBackBtn" style="border:0;border-radius:9px;padding:10px 16px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Back to Dashboard</button>'
        +(allowSignOut?'<button id="megGatewaySignOutBtn" style="border:1px solid #ccd6e6;border-radius:9px;padding:10px 16px;background:#fff;color:#33456d;font-weight:700;cursor:pointer">Sign Out</button>':'')
        +'</div></div></div>';
      var b=document.getElementById('megGatewayBackBtn'); if(b)b.onclick=function(){location.href=DASHBOARD_URL;};
      var s=document.getElementById('megGatewaySignOutBtn'); if(s)s.onclick=function(){clearSession();location.href=DASHBOARD_URL;};
    }
    if(document.body) draw(); else document.addEventListener('DOMContentLoaded',draw,{once:true});
  }

  function redirectToLogin(){
    var q='?next='+encodeURIComponent(APP_CODE)+'&reason=login';
    location.replace(DASHBOARD_URL+q);
  }

  function authFetch(path,opts,retry){
    opts=opts||{};
    var freshHeaders={
      'Content-Type':'application/json',
      'apikey':SUPABASE_ANON_KEY,
      'X-Client-Info':CLIENT_INFO
    };
    if(session&&session.access_token) freshHeaders.Authorization='Bearer '+session.access_token;
    opts.headers=Object.assign({},opts.headers||{},freshHeaders);
    return fetch(SUPABASE_URL+path,opts).then(function(r){
      if(r.status===401 && session && session.refresh_token && !retry){
        return refreshSession().then(function(){return authFetch(path,opts,true);});
      }
      return r.text().then(function(txt){
        var body=safeJson(txt);
        if(!r.ok){
          var msg=body&&(body.message||body.msg||body.error_description||body.hint)||txt||('HTTP '+r.status);
          var e=new Error(msg); e.status=r.status; throw e;
        }
        return body;
      });
    });
  }

  function refreshSession(){
    if(!session||!session.refresh_token) return Promise.reject(new Error('SESSION_EXPIRED'));
    return fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'X-Client-Info':CLIENT_INFO},
      body:JSON.stringify({refresh_token:session.refresh_token})
    }).then(function(r){return r.json().then(function(b){return {ok:r.ok,b:b};});})
      .then(function(x){
        if(!x.ok||!x.b||!x.b.access_token) throw new Error('SESSION_EXPIRED');
        storeSession({access_token:x.b.access_token,refresh_token:x.b.refresh_token});
      }).catch(function(e){clearSession();throw e;});
  }

  function rpcAuthenticated(fn,args){
    return authFetch('/rest/v1/rpc/'+fn,{method:'POST',body:JSON.stringify(args||{})});
  }

  function rpcAnon(fn,args){
    return fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'X-Client-Info':CLIENT_INFO},
      body:JSON.stringify(args||{})
    }).then(function(r){return r.text().then(function(txt){
      var body=safeJson(txt);
      if(!r.ok) throw new Error((body&&(body.message||body.hint))||txt||('HTTP '+r.status));
      return body;
    });});
  }

  function hasRecoveryHash(){
    if(APP_CODE!=='hr') return false;
    var h=location.hash||'';
    return h.indexOf('type=recovery')!==-1 && h.indexOf('access_token=')!==-1;
  }

  function installInvitationLock(){
    function lock(){
      var sel=document.getElementById('companySelect');
      if(!sel||!invitationInfo) return;
      sel.value=String(invitationInfo.company_code||'meg').toLowerCase();
      try{ if(typeof window.onEafCompanyChange==='function') window.onEafCompanyChange(); }catch(e){}
      sel.disabled=true;
      sel.title='Employer fixed by the HR invitation link';
      var lbl=sel.closest('label');
      if(lbl && !document.getElementById('megInviteEmployerNote')){
        var note=document.createElement('span');
        note.id='megInviteEmployerNote';
        note.textContent='  🔒 invitation employer';
        note.style.cssText='font-size:10px;color:#1565c0;font-weight:700;margin-left:5px';
        lbl.appendChild(note);
      }
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',lock,{once:true}); else lock();
  }

  function installInvitationConsumeObserver(){
    function setup(){
      var overlay=document.getElementById('successOverlay');
      if(!overlay||!invitationToken) return;
      function maybeConsume(){
        if(invitationConsumed) return;
        var shown=getComputedStyle(overlay).display!=='none';
        if(!shown) return;
        invitationConsumed=true;
        rpcAnon('eaf_v2_gateway_consume_invitation',{p_token:invitationToken}).catch(function(e){
          console.warn('Invitation use could not be recorded:',e);
        });
      }
      new MutationObserver(maybeConsume).observe(overlay,{attributes:true,attributeFilter:['style','class']});
      maybeConsume();
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setup,{once:true}); else setup();
  }

  function tryInvitation(){
    if(APP_CODE!=='apply') return Promise.resolve(false);
    var params=new URLSearchParams(location.search);
    var tok=params.get('invite');
    if(!tok) return Promise.resolve(false);
    invitationToken=tok;
    return rpcAnon('eaf_v2_gateway_validate_invitation',{p_token:tok}).then(function(rows){
      var r=Array.isArray(rows)?rows[0]:rows;
      if(!r||r.allowed!==true){
        renderBlocked('Invitation Link Unavailable','This application invitation is invalid, expired, revoked, or has already reached its usage limit. Please request a new link from MyEden Group HR.',false);
        return true;
      }
      invitationInfo=r;
      installInvitationLock();
      installInvitationConsumeObserver();
      reveal();
      return true;
    }).catch(function(e){
      console.warn('Invitation validation failed:',e);
      renderBlocked('Invitation Link Unavailable','This application invitation could not be verified. Please request a new link from MyEden Group HR.',false);
      return true;
    });
  }

  function tryInternalSession(){
    session=loadSession();
    if(!session||!session.access_token) return Promise.resolve(false);
    return authFetch('/auth/v1/user').then(function(){
      return rpcAuthenticated('eaf_v2_gateway_my_access',{});
    }).then(function(data){
      var apps=data&&data.apps||{};
      var app=apps[APP_CODE];
      if(!app||app.allowed!==true){
        renderBlocked('Access Restricted','You do not currently have permission to access this application.',true);
        return true;
      }
      reveal();
      rpcAuthenticated('eaf_v2_gateway_log_app_open',{p_app_code:APP_CODE}).catch(function(){});
      return true;
    }).catch(function(e){
      if(e&&e.status===401){clearSession();return false;}
      if(String(e&&e.message||'').indexOf('SESSION_EXPIRED')!==-1){clearSession();return false;}
      renderBlocked('Access Control Unavailable','This application could not verify your access. Please return to the dashboard and try again.',true);
      return true;
    });
  }

  if(!APP_CODE){
    renderBlocked('Access Control Error','This page is missing its application access code.',false);
    return;
  }

  // Password-reset links must reach the existing HR recovery UI before a normal session exists.
  if(hasRecoveryHash()){
    reveal();
    return;
  }

  tryInvitation().then(function(invited){
    if(invited) return true;
    return tryInternalSession();
  }).then(function(handled){
    if(!handled) redirectToLogin();
  }).catch(function(){
    renderBlocked('Access Control Unavailable','This application could not verify your access. Please return to the dashboard and try again.',false);
  });
})();
