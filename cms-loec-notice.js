/* MEG-EAF V2 · Offer letters (LOEC) moved to the MyEden Group CMS (CLC 7 Nov 2026)
 * When the CMS setting "loec_builder" is "cms", this page no longer creates, issues or revises offer letters:
 *  - "Print Appointment Letter" becomes "Open offer letter in the CMS" for the application on screen;
 *  - the LOEC record panel keeps signed copy, verification and stamp duty, and hides Create / Mark Issued / New Revision;
 *  - a notice explains where to go. The database also refuses new LOEC records made outside the CMS.
 * Setting it back to "both" in the CMS restores the old buttons (nothing here is deleted).
 */
(function () {
  'use strict';
  var CMS_LOEC = 'https://myedengp01.github.io/MyEden-Group-CMS-V1.0/app/#/loec?app=';
  var setting = null; var asking = false;
  var HIDE = ['v2CreateLoecRecord(', 'v2MarkLoecIssued(', 'v2NewLoecRevision('];

  function link() {
    var id = (typeof window.currentAppId !== 'undefined' && window.currentAppId) ? window.currentAppId : '';
    return ((setting && setting.link) || CMS_LOEC) + encodeURIComponent(id);
  }
  function ask() {
    if (asking || setting || typeof window.apiFetch !== 'function') return;
    asking = true;
    window.apiFetch('/rest/v1/rpc/cms_setting_get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: 'loec_builder' }) })
      .then(function (v) { setting = v || { mode: 'both' }; apply(); })
      .catch(function () { /* not signed in yet: try again shortly */ })
      .then(function () { asking = false; });
  }
  function notice() {
    var d = document.createElement('div');
    d.className = 'cms-loec-notice';
    d.style.cssText = 'margin:8px 0 12px;padding:12px 14px;border-radius:10px;border:1px solid #f59e0b;background:#fff7e6;color:#5b3a00;font-size:13px;line-height:1.5';
    d.innerHTML = '<b>Offer letters (LOEC) are now prepared, approved and issued in the MyEden Group CMS.</b><br>'
      + 'For an issued letter, the signed copy, verification and stamp duty are still recorded here. '
      + '<a class="cms-loec-go" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;padding:6px 12px;border-radius:8px;background:#0d47a1;color:#fff;text-decoration:none;font-weight:600">Open offer letter in the CMS →</a>';
    return d;
  }
  function apply() {
    if (!setting || setting.mode !== 'cms') return;
    var p = document.getElementById('btnPrintLetter');
    if (p && !p.dataset.cms) {
      p.dataset.cms = '1';
      p.innerHTML = '&#128203; Open offer letter in the CMS';
      p.onclick = function (e) { e.preventDefault(); window.open(link(), '_blank', 'noopener'); };
      p.title = 'Offer letters are prepared and issued in the MyEden Group CMS';
    }
    var panel = document.getElementById('v2LoecPanel');
    if (panel) {
      Array.prototype.forEach.call(panel.querySelectorAll('button'), function (b) {
        var oc = b.getAttribute('onclick') || '';
        if (HIDE.some(function (h) { return oc.indexOf(h) >= 0; })) b.style.display = 'none';
      });
      if (!panel.querySelector('.cms-loec-notice')) { var h = panel.querySelector('h4'); panel.insertBefore(notice(), h ? h.nextSibling : panel.firstChild); }
    }
    var sec = document.getElementById('letterSectionHeader');
    if (sec && !document.getElementById('cmsLoecPrevNote')) {
      var n = notice(); n.id = 'cmsLoecPrevNote'; sec.parentNode.insertBefore(n, sec.nextSibling);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.cms-loec-go'), function (a) { a.href = link(); });
  }
  setInterval(function () { if (!setting) ask(); else apply(); }, 1500);
  document.addEventListener('DOMContentLoaded', ask);
})();
