/*
 * MEG-Employment & HR System V2 — Stage 3 Multi-Entity LOEC Engine (Stage 3B management update)
 * Build: v2026.09.10-21:29
 *
 * Additive module loaded after v2-stage2-hr.js.
 * Scope:
 * - Refactors LOEC rendering to use the selected legal employer profile.
 * - Binds Stage 2 employment terms, remuneration and JD metadata into the LOEC.
 * - Adds legal-employer master-data review status and blocks final issue while unverified.
 * - Corrects statutory sick-leave wording to 14/18/22 days + 60 hospitalisation days.
 * - Updates 2026 stamp-duty wording: RM10; generally within 30 days if signed in Malaysia.
 *
 * Deliberately NOT included:
 * - signed LOEC upload / verification / immutable storage
 * - stamp certificate upload / stamp status tracking
 * - handbook acknowledgement tracking
 * - production Supabase schema/RLS changes
 */
(function(global){
  'use strict';

  var S3 = global.MEG_EAF_V2_STAGE3 = global.MEG_EAF_V2_STAGE3 || {};
  S3.version = 'MEG-Employment & HR System V2 Stage 3B v2026.09.16-11:17';
  S3.loecVersion = '2.0';

  /*
   * Stage 3B Management verification — 16 Sep 2026.
   * MEG / MEH / HDS / ABN legal-employer registration, addresses, phone and email
   * were explicitly confirmed correct by Management before this build.
   */
  S3.profileReview = {
    meg:{status:'verified',note:'Management verified legal-employer master data on 16 Sep 2026.'},
    meh:{status:'verified',note:'Management verified legal-employer master data on 16 Sep 2026.'},
    hds:{status:'verified',note:'Management verified legal-employer master data on 16 Sep 2026.'},
    abn:{status:'verified',note:'Management verified legal-employer master data on 16 Sep 2026.'}
  };

  function byId(id){ return document.getElementById(id); }
  function esc3(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function text(id){ var el=byId(id); return el?String(el.value||'').trim():''; }
  function code(){ return (byId('companySelect')&&byId('companySelect').value)||'meg'; }
  function companyObj(){ try{ if(typeof EAF_COMPANIES!=='undefined') return EAF_COMPANIES[code()]||{}; }catch(e){} return {}; }
  function companyProfile(){ var c=companyObj(), r=S3.profileReview[code()]||{status:'review_required',note:'Company master data requires verification.'}; return {
    code:code(), name:c.name||code().toUpperCase(), regNo:c.regNo||'', address:c.address||'', regAddress:c.regAddress||'', phone:c.phone||'', email:c.email||'', banner:c.banner||'', logo:c.logo||'', reviewStatus:r.status, reviewNote:r.note
  }; }
  function profileVerified(){ return companyProfile().reviewStatus==='verified'; }
  function moneyNumber(v){ var n=parseFloat(v||0); return isFinite(n)?n:0; }
  function money(v){ return 'RM '+moneyNumber(v).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function longDate(v){ try{ return typeof fmtDateLong==='function'?fmtDateLong(v):v; }catch(e){return v||'';} }
  function blank(v){ try{ return typeof orBlank==='function'?orBlank(v):((v||'').trim()||'________________________________'); }catch(e){ return (v||'').trim()||'________________________________'; } }
  function pluralUnit(n,u){ var x=String(u||'weeks'); return Number(n)===1?x.replace(/s$/,''):x; }
  function employmentType(){ return text('v2EmploymentType')||'Employment type not specified'; }
  function fixedTermEnd(){ return text('v2FixedTermEnd'); }
  function handbook(){ return text('v2Handbook')||'Employee Handbook'; }
  function offDay(){ return text('v2OffDay'); }
  function restDay(){ return text('v2RestDay'); }
  function otCategory(){ return text('v2OtCategory'); }
  function probationMonths(){ return text('v2ProbationMonths'); }
  function probationNotice(){ return text('v2ProbationNotice'); }
  function probationNoticeUnit(){ return text('v2ProbationNoticeUnit')||'weeks'; }
  function jdReference(){ return text('v2JdReference'); }
  function selectedPosition(){ try{ return typeof resolvePosition==='function'?resolvePosition():{}; }catch(e){return {};} }
  function fixedAllowance(){ return moneyNumber(text('v2FixedAllowance')); }
  function otherAllowance(){ return moneyNumber(text('v2OtherAllowance')); }
  function basicSalary(){ return moneyNumber(text('finalSalary')); }
  function totalFixed(){ return basicSalary()+fixedAllowance()+otherAllowance(); }

  function otLabel(v){
    var m={
      statutory_ot:'Statutory OT eligible',
      non_statutory:'Non-statutory OT / Additional Work T&C',
      manual_prescribed:'Manual employee / prescribed statutory category',
      part_time:'Part-time statutory arrangement',
      other:'Other approved category'
    };
    return m[v]||'HR classification required';
  }
  function otClause(v){
    if(v==='statutory_ot') return 'Where the Employee is legally entitled to overtime, rest-day or paid-holiday payments, such payments will be made at not less than the applicable statutory rate.';
    if(v==='manual_prescribed') return 'The Employee is classified by HR within a manual/prescribed statutory category. Overtime, rest-day and paid-holiday entitlements will be administered in accordance with the applicable statutory provisions.';
    if(v==='part_time') return 'The Employee is engaged under a part-time statutory arrangement. Additional hours, rest days and paid holidays will be administered in accordance with the applicable statutory requirements and the Employer’s written policy.';
    if(v==='non_statutory') return 'The Employee is classified by HR as outside the statutory overtime-payment category, subject always to mandatory legal entitlements that cannot be contracted out. Any approved additional-work arrangement is governed by the Employer’s written policy or separate written approval.';
    return 'Overtime, rest-day, paid-holiday and additional-work arrangements are governed by applicable law and the Employer’s written policy. The HR classification recorded for this appointment must be legally supportable.';
  }
  function termClause(d){
    if(d.employmentType==='Fixed-Term Full-Time' && d.fixedTermEndFmt){
      return 'This is a fixed-term employment commencing on '+d.startDateFmt+' and scheduled to end on '+d.fixedTermEndFmt+', unless lawfully extended or terminated earlier in accordance with this Contract.';
    }
    if(d.employmentType==='Temporary' || d.employmentType==='Internship'){
      return 'This employment is classified as '+d.employmentType+'. The appointment commences on '+d.startDateFmt+' and continues according to the stated appointment terms unless terminated earlier in accordance with this Contract.';
    }
    return 'The Employee’s employment commences on '+d.startDateFmt+' ("Commencement Date") and continues, subject to the terms of this Contract, until terminated by either party in accordance with this Contract.';
  }

  function installStyles(){
    if(byId('v2Stage3Style')) return;
    var st=document.createElement('style'); st.id='v2Stage3Style';
    st.textContent='\n'
      +'.v2s3-panel{border:1px solid #c8b7e8;background:#fbf9ff;border-radius:8px;padding:11px 12px;margin:10px 0 12px}\n'
      +'.v2s3-panel h4{margin:0 0 8px;color:#5e35b1;font-size:13px}.v2s3-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:10.5px}\n'
      +'.v2s3-label{font-weight:700;color:#5f536f}.v2s3-status{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#fff3e0;color:#a15c00}\n'
      +'.v2s3-status.ok{background:#e8f5e9;color:#2e7d32}.v2s3-alert{margin-top:8px;background:#fff8e1;border-left:3px solid #ef6c00;padding:7px 9px;font-size:10px;line-height:1.45;color:#6d4c00}\n'
      +'.v2s3-watermark{font-size:10px;font-weight:800;letter-spacing:.4px;color:#b71c1c;border:1px solid #ef9a9a;background:#ffebee;padding:5px 8px;margin:0 0 10px;text-align:center}\n'
      +'@media(max-width:700px){.v2s3-grid{grid-template-columns:1fr}}\n';
    document.head.appendChild(st);
  }

  function renderProfilePanel(){
    var box=byId('v2Stage3Profile'); if(!box) return;
    var p=companyProfile(), ok=p.reviewStatus==='verified';
    box.innerHTML='<h4>V2 Stage 3 — Legal Employer LOEC Profile <span class="v2s3-status '+(ok?'ok':'')+'">'+(ok?'VERIFIED':'REVIEW REQUIRED')+'</span></h4>'
      +'<div class="v2s3-grid">'
      +'<div><span class="v2s3-label">Legal Employer</span><br>'+esc3(p.name)+'</div>'
      +'<div><span class="v2s3-label">Registration</span><br>'+esc3(p.regNo||'—')+'</div>'
      +'<div><span class="v2s3-label">Business Address</span><br>'+esc3(p.address||'—')+'</div>'
      +'<div><span class="v2s3-label">Registered Address</span><br>'+esc3(p.regAddress||'—')+'</div>'
      +'<div><span class="v2s3-label">Phone</span><br>'+esc3(p.phone||'—')+'</div>'
      +'<div><span class="v2s3-label">Email</span><br>'+esc3(p.email||'—')+'</div>'
      +'</div>'
      +(ok?'':'<div class="v2s3-alert"><strong>Legal-document issue gate:</strong> '+esc3(p.reviewNote)+' Preview remains available, but final Print LOEC is blocked until this profile is centrally marked verified.</div>');
  }

  function insertPanel(){
    if(byId('v2Stage3Profile')) return;
    var s2=byId('v2EmploymentTerms');
    if(!s2) return;
    var p=document.createElement('div'); p.id='v2Stage3Profile'; p.className='v2s3-panel';
    s2.parentNode.insertBefore(p,s2.nextSibling); renderProfilePanel();
  }

  var oldGather=global.gatherLoceData;
  global.gatherLoceData=function(){
    var d=typeof oldGather==='function'?oldGather():{};
    var p=companyProfile(), pos=selectedPosition();
    d.company=p;
    d.companyCode=p.code;
    d.employmentType=employmentType();
    d.fixedTermEnd=fixedTermEnd();
    d.fixedTermEndFmt=d.fixedTermEnd?longDate(d.fixedTermEnd):'';
    d.probationMonths=probationMonths();
    d.probationNotice=probationNotice();
    d.probationNoticeUnit=probationNoticeUnit();
    d.probationNoticeText=d.probationNotice?d.probationNotice+' '+pluralUnit(d.probationNotice,d.probationNoticeUnit):'';
    d.otCategory=otCategory();
    d.otCategoryLabel=otLabel(d.otCategory);
    d.handbook=handbook();
    d.offDay=offDay();
    d.restDay=restDay();
    d.jdReference=jdReference()||(pos&&pos.jdReference)||'';
    d.jobLevel=(pos&&pos.lvl)||'';
    d.basicSalaryValue=basicSalary();
    d.fixedAllowanceValue=fixedAllowance();
    d.otherAllowanceValue=otherAllowance();
    d.totalFixedValue=totalFixed();
    d.basicSalaryFmt=money(d.basicSalaryValue);
    d.fixedAllowanceFmt=money(d.fixedAllowanceValue);
    d.otherAllowanceFmt=money(d.otherAllowanceValue);
    d.totalFixedFmt=money(d.totalFixedValue);
    d.profileVerified=profileVerified();
    return d;
  };

  global.buildLocePage1HTML=function(d){
    var p=d.company||companyProfile();
    var review=d.profileVerified?'':'<div class="v2s3-watermark">MASTER DATA REVIEW REQUIRED — STAGING PREVIEW — NOT FOR ISSUE</div>';
    var allowanceDetail=[];
    if(d.fixedAllowanceValue>0) allowanceDetail.push('Fixed contractual allowance '+d.fixedAllowanceFmt);
    if(d.otherAllowanceValue>0) allowanceDetail.push('Other contractual allowance '+d.otherAllowanceFmt);
    var probation=d.probationMonths?d.probationMonths+' month(s)':'Not specified';
    return review
      +'<p class="letter-private">PRIVATE &amp; CONFIDENTIAL</p>'
      +'<p>'+d.letterDateFmt+'</p>'
      +'<div class="letter-tight" style="margin-top:10px"><p>'+d.name+'</p><p>'+d.ic+'</p>'+d.addrLines.map(function(l){return '<p>'+l+'</p>';}).join('')+'</div>'
      +'<p style="margin-top:14px">Dear '+d.title+' '+d.name+',</p>'
      +'<p class="l-clause-title" style="text-align:left;text-decoration:underline">LETTER OF OFFER &amp; CONTRACT OF EMPLOYMENT — '+String(d.jobTitle||'').toUpperCase()+'</p>'
      +'<p>This Letter of Offer and Contract of Employment is made on <strong>'+d.letterDateFmt+'</strong> between:</p>'
      +'<p><strong>'+esc3(p.name)+'</strong> (Company No.: <strong>'+esc3(p.regNo)+'</strong>), a company incorporated in Malaysia with its registered address at <strong>'+esc3(p.regAddress)+'</strong> ("the Employer"), and</p>'
      +'<p><strong>'+d.name+'</strong> (NRIC/Passport No.: <strong>'+d.ic+'</strong>), of <strong>'+d.addrInline+'</strong> ("the Employee").</p>'
      +'<p>This Letter of Offer &amp; Contract of Employment ("the Contract"), together with the applicable Employee Handbook and any written Employer policies incorporated by reference, records the terms and conditions of the Employee’s employment.</p>'
      +'<p>The Employer offers employment and the Employee agrees to serve on the following salient terms:</p>'
      +'<table class="l-salient">'
      +'<tr><th style="width:42%">Salient Term</th><th>Detail</th></tr>'
      +'<tr><td>a. Legal Employer</td><td>'+esc3(p.name)+'</td></tr>'
      +'<tr><td>b. Employment Type</td><td>'+esc3(d.employmentType)+(d.fixedTermEndFmt?' — ending '+esc3(d.fixedTermEndFmt):'')+'</td></tr>'
      +'<tr><td>c. Job Title / Level</td><td>'+d.jobTitle+(d.jobLevel?' / '+esc3(d.jobLevel):'')+(d.jdReference?' — JD '+esc3(d.jdReference):'')+'</td></tr>'
      +'<tr><td>d. Commencement Date</td><td>'+d.startDateFmt+'</td></tr>'
      +'<tr><td>e. Probation</td><td>'+esc3(probation)+(d.probationNoticeText?' — probation notice '+esc3(d.probationNoticeText):'')+'</td></tr>'
      +'<tr><td>f. Basic Salary</td><td>'+d.basicSalaryFmt+' ('+d.salaryWords+')</td></tr>'
      +'<tr><td>g. Fixed Monthly Allowances</td><td>'+(allowanceDetail.length?allowanceDetail.join('<br>'):'None recorded')+'</td></tr>'
      +'<tr><td>h. Total Fixed Monthly Remuneration</td><td>'+d.totalFixedFmt+'</td></tr>'
      +'<tr><td>i. Working Hours</td><td>From '+d.timeFrom+' to '+d.timeTo+(d.offDay?' · Normal off day: '+esc3(d.offDay):'')+(d.restDay?' · Rest day: '+esc3(d.restDay):'')+'</td></tr>'
      +'<tr><td>j. OT / Additional Work Classification</td><td>'+esc3(d.otCategoryLabel)+'</td></tr>'
      +'<tr><td>k. Place of Work</td><td>'+d.workLocation+'</td></tr>'
      +'<tr><td>l. Reporting Personnel</td><td>'+d.reportingName+(d.reportingTitle && d.reportingTitle!=='________________________________'?' ('+d.reportingTitle+')':'')+'</td></tr>'
      +'<tr><td>m. Applicable Handbook</td><td>'+esc3(d.handbook)+'</td></tr>'
      +'</table>';
  };

  global.buildLoceClauseBlocks=function(d){
    var C3=global.C, BH3=global.BH, BA3=global.BA;
    var probationPeriod=d.probationMonths?d.probationMonths+' month(s)':'the probation period stated in the salient terms';
    var probationNotice=d.probationNoticeText||'the notice period stated in the salient terms';
    var salaryAllowance = (d.fixedAllowanceValue||d.otherAllowanceValue)
      ? ' In addition, the Employee is paid fixed contractual allowance(s) of '+d.fixedAllowanceFmt+(d.otherAllowanceValue?' and other contractual allowance(s) of '+d.otherAllowanceFmt:'')+', making total fixed monthly remuneration of '+d.totalFixedFmt+'.'
      : '';
    return [
      BH3('<p class="l-clause-title">1. COMMENCEMENT AND TERM</p>'),
      C3('1.1', termClause(d)),
      C3('1.2', 'Employment classification: '+esc3(d.employmentType)+(d.fixedTermEndFmt?' (fixed-term end date: '+esc3(d.fixedTermEndFmt)+')':'')+'. Any renewal or extension must be recorded in writing where required.'),

      BH3('<p class="l-clause-title">2. POSITION, REPORTING AND DUTIES</p>'),
      C3('2.1', 'The Employee is employed as '+d.jobTitle+', under '+d.dept+' department, and reporting to '+d.reportingName+', or such other person as the Employer may designate.'),
      C3('2.2', 'The Employee shall perform the duties set out in Appendix 1 (Job Description)'+(d.jdReference?' under JD reference '+esc3(d.jdReference):'')+' and undertake other reasonable duties consistent with the position and the Employer’s business needs.'),
      C3('2.3', 'The Employee shall devote the required working time and attention to the Employer’s business and shall not, without prior written consent, engage in another activity that creates an actual conflict with the Employee’s duties.'),

      BH3('<p class="l-clause-title">3. PROBATION AND CONFIRMATION OF EMPLOYMENT</p>'),
      C3('3.1', 'The Employee will undergo a probationary period of '+esc3(probationPeriod)+' from the Commencement Date.'),
      C3('3.2', 'During probation, either party may terminate this Contract by giving '+esc3(probationNotice)+' written notice or salary in lieu of notice, subject to applicable law.'),
      C3('3.3', 'On satisfactory completion of probation, confirmation will be communicated in writing. Any probation extension must be authorised and communicated in writing in accordance with the Employer’s policy and applicable law.'),

      BH3('<p class="l-clause-title">4. PLACE OF WORK AND RIGHT TO TRANSFER</p>'),
      C3('4.1', 'The Employee’s normal place of work is '+d.workLocation+'.'),
      C3('4.2', 'Subject to applicable law, operational need and reasonable notice where practicable, the Employer may require the Employee to work at another Employer location or approved work location.'),

      BH3('<p class="l-clause-title">5. HOURS OF WORK, REST DAY AND ADDITIONAL WORK</p>'),
      C3('5.1', 'The Employee’s normal scheduled hours are from '+d.timeFrom+' to '+d.timeTo+'. The normal off day is '+blank(d.offDay)+' and the rest day is '+blank(d.restDay)+'. Working-time arrangements are administered so that normal working time does not exceed 45 hours per week excluding rest periods, subject to lawful exceptions, and required rest periods are observed.'),
      C3('5.2', otClause(d.otCategory)),
      C3('5.3', 'The HR classification recorded for this appointment is: '+esc3(d.otCategoryLabel)+'. This system classification does not remove any mandatory entitlement that applies by law.'),

      BH3('<p class="l-clause-title">6. WAGES AND STATUTORY CONTRIBUTIONS</p>'),
      C3('6.1', 'The Employee is paid a basic salary of '+d.basicSalaryFmt+' ('+d.salaryWords+') per month, payable monthly in arrears through the Employee’s nominated financial institution, subject to statutory payment deadlines.'+salaryAllowance),
      C3('6.2', 'Variable claims, reimbursements, commissions, incentives or bonuses are not part of fixed monthly remuneration unless expressly stated in writing as contractual remuneration.'),
      C3('6.3', 'The Employer will make the statutory deductions and contributions applicable to the Employee at prevailing legal rates, including EPF, SOCSO, EIS and tax deductions where applicable.'),

      BH3('<p class="l-clause-title">7. LEAVE AND PUBLIC HOLIDAYS</p>'),
      C3('7.1', 'The Employee is entitled to annual leave per calendar year according to the applicable statutory minimum or any more favourable entitlement stated in the '+esc3(d.handbook)+'. For incomplete service periods, entitlement is administered in accordance with applicable law and Employer policy.'),
      BA3('<p class="l-tbl-title">Table A — Statutory Annual Leave Minimum</p><table><tr><th>Length of Continuous Employment</th><th>Paid Annual Leave</th></tr><tr><td>&lt; 2 years</td><td>8 days/year</td></tr><tr><td>≥ 2 years but &lt; 5 years</td><td>12 days/year</td></tr><tr><td>≥ 5 years</td><td>16 days/year</td></tr></table>'),
      C3('7.2', 'Paid sick leave entitlement is 14 days per calendar year for service under 2 years, 18 days for service of 2 years but under 5 years, and 22 days for service of 5 years or more, plus up to 60 days of paid hospitalisation leave, subject to the Employment Act 1955 and valid medical certification requirements.'),
      C3('7.3', 'The Employee is entitled to paid public holidays in accordance with applicable law and the Employer’s published holiday schedule. Work on a paid public holiday is compensated according to applicable statutory entitlement where the Employee is eligible.'),
      C3('7.4', 'Maternity leave, paternity leave and other statutory leave are granted in accordance with the Employment Act 1955 and other applicable law.'),

      BH3('<p class="l-clause-title">8. FLEXIBLE WORKING ARRANGEMENT</p>'),
      C3('8.1', 'The Employee may make a written application for a flexible working arrangement in accordance with the Employment Act 1955. The Employer will respond within the statutory timeframe and, where an application is refused, provide the required reason.'),

      BH3('<p class="l-clause-title">9. BENEFITS</p>'),
      C3('9.1', 'Employment benefits, if any, are governed by the '+esc3(d.handbook)+' and any benefit schedule or written policy applicable to this legal employer.'),
      C3('9.2', 'Benefits that are policy-based and not expressly contractual may be reviewed or amended by the Employer subject to applicable law and the terms of the relevant policy.'),

      BH3('<p class="l-clause-title">10. CONDUCT, CONFIDENTIALITY AND INTELLECTUAL PROPERTY</p>'),
      C3('10.1', 'The Employee shall comply with lawful rules, policies and procedures of the Employer, including the applicable Employee Handbook, Code of Conduct, IT/data-protection rules and health and safety requirements.'),
      C3('10.2', 'The Employee shall keep confidential non-public information relating to the Employer’s business, clients, suppliers and employees, except where disclosure is authorised, required for proper duties or required by law.'),
      C3('10.3', 'Intellectual property created in the course of employment is dealt with according to applicable law and any written Employer policy or specific written agreement.'),

      BH3('<p class="l-clause-title">11. SEXUAL HARASSMENT AND ANTI-DISCRIMINATION</p>'),
      C3('11.1', 'The Employer maintains workplace procedures addressing sexual harassment and discrimination in accordance with applicable law.'),
      C3('11.2', 'The Employee shall not engage in sexual harassment or unlawful discrimination at work and shall cooperate with lawful workplace inquiries.'),

      BH3('<p class="l-clause-title">12. NO FORCED LABOUR</p>'),
      C3('12.1', 'The Employee is engaged freely. No person may threaten, deceive or coerce the Employee into performing forced labour prohibited by law.'),

      BH3('<p class="l-clause-title">13. PERSONAL DATA PROTECTION</p>'),
      C3('13.1', 'The Employer may collect, use, disclose, retain and otherwise process the Employee’s personal data for legitimate employment, payroll, statutory, administrative, security and verification purposes in accordance with applicable Malaysian personal-data law and the Employer’s Privacy Notice.'),

      BH3('<p class="l-clause-title">14. ABSENCE AND ATTENDANCE</p>'),
      C3('14.1', 'The Employee must report absence as soon as practicable and comply with the absence-reporting procedure in the '+esc3(d.handbook)+'.'),
      C3('14.2', 'Unauthorised absence, attendance misconduct or persistent lateness may be addressed under the Employer’s disciplinary procedure, subject to applicable law.'),

      BH3('<p class="l-clause-title">15. NOTICE AND TERMINATION</p>'),
      C3('15.1', 'After confirmation, either party may terminate this Contract by giving the contractual notice stated in Table B or salary in lieu of notice, subject to any mandatory statutory minimum.'),
      BA3('<p class="l-tbl-title">Table B — Contractual Notice of Termination (After Confirmation)</p><table><tr><th>Period of Employment</th><th>Notice</th></tr><tr><td>&lt; 2 years</td><td>4 weeks</td></tr><tr><td>≥ 2 years but &lt; 5 years</td><td>6 weeks</td></tr><tr><td>≥ 5 years</td><td>12 weeks</td></tr></table>'),
      C3('15.2', 'The Employer may take disciplinary action up to and including dismissal for misconduct following the process required by applicable law and the Employer’s disciplinary procedure.'),
      C3('15.3', 'On termination, the Employee shall return Employer property, cease representing the Employer and settle outstanding obligations subject to lawful deductions and final-payment requirements.'),

      BH3('<p class="l-clause-title">16. DISCIPLINARY AND GRIEVANCE PROCEDURES</p>'),
      C3('16.1', 'The Employer’s disciplinary procedure is contained in the '+esc3(d.handbook)+' and related policies, subject to applicable law.'),
      C3('16.2', 'The Employee may raise grievances through the Employer’s published grievance procedure.'),

      BH3('<p class="l-clause-title">17. GOVERNING LAW AND LANGUAGE</p>'),
      C3('17.1', 'This Contract is governed by the laws of Malaysia applicable to the Employee’s place of employment.'),
      C3('17.2', 'Where a statutory minimum applies and conflicts with a less favourable term of this Contract, the applicable statutory minimum prevails.'),
      C3('17.3', 'The English version of this Contract governs unless the parties expressly execute another governing-language version.'),

      BH3('<p class="l-clause-title">18. ENTIRE AGREEMENT AND VARIATION</p>'),
      C3('18.1', 'This Contract, the '+esc3(d.handbook)+' and written policies or schedules incorporated by reference form the employment framework between the parties.'),
      C3('18.2', 'Changes to core contractual terms must be documented in writing as required by law. Policy changes may be communicated separately where legally permissible.'),

      BH3('<p class="l-clause-title">19. STAMP DUTY</p>'),
      C3('19.1', 'For an employment contract executed on or after 1 January 2026, the instrument is generally subject to RM10 stamp duty. Where executed in Malaysia, it should be submitted for stamping within 30 days from signing; late stamping may attract the applicable penalty under the Stamp Act 1949.')
    ];
  };

  global.buildLoceSignatureBlocks=function(d){
    var p=d.company||companyProfile();
    return [global.BA('<p style="font-weight:700;margin-top:16px">SIGNED by the parties:</p>'
      +'<table class="l-sigtable" style="border:none"><tr style="border:none">'
      +'<td style="border:none;width:50%;vertical-align:top;text-align:left">For and on behalf of<br><strong>'+esc3(p.name)+'</strong><br><br><br><br>.....................................................<br>Name:<br>Designation:<br>Date:</td>'
      +'<td style="border:none;width:50%;vertical-align:top;text-align:left">Signed by the Employee<br><strong>'+esc3(d.name)+'</strong><br><br><br><br>.....................................................<br>NRIC/Passport No.: '+esc3(d.ic)+'<br>Date:</td>'
      +'</tr></table>')];
  };

  global.buildLoceAppendixBlocks=function(d){
    var blocks=[
      global.BH('<h3>APPENDIX 1 — JOB DESCRIPTION</h3>'),
      global.B('<p style="font-weight:700">Position: '+d.jobTitle+(d.jobLevel?' ('+esc3(d.jobLevel)+')':'')+'</p>'),
      d.jdReference?global.B('<p><strong>JD Reference:</strong> '+esc3(d.jdReference)+'</p>'):global.B('<p><strong>JD Reference:</strong> Not assigned / manual HR entry</p>')
    ];
    var content=d.appendix1||'';
    var lines=content.split('\n'), list=[];
    function flush(){ if(list.length){ blocks.push(global.B('<ul>'+list.join('')+'</ul>')); list=[]; } }
    lines.forEach(function(ln){
      var t=ln.trim(); if(!t){flush();return;}
      if(t==='JOB PURPOSE'||t==='KEY RESPONSIBILITIES'){flush();blocks.push(global.B('<p style="font-weight:700;text-decoration:underline">'+esc3(t)+'</p>'));return;}
      var m=t.match(/^([^:]{2,60}):\s*(.+)$/); if(m) list.push('<li><strong>'+esc3(m[1])+':</strong><br>'+esc3(m[2])+'</li>');
      else {flush();blocks.push(global.B('<p>'+esc3(t)+'</p>'));}
    });
    flush(); return blocks;
  };

  global.buildLetterheadHTML=function(){
    var p=companyProfile();
    if(p.banner) return '<div class="letter-head"><img src="'+p.banner+'" alt="'+esc3(p.name)+' Letterhead"></div>';
    return '<div class="letter-head" style="padding:8px 0;border-bottom:1px solid #999"><strong>'+esc3(p.name)+'</strong><br><span style="font-size:10px">'+esc3(p.address)+' · '+esc3(p.phone)+' · '+esc3(p.email)+'</span></div>';
  };

  global.wrapLetterPage=function(pageInnerHtml,letterheadHtml,pageIndex,totalPages){
    var p=companyProfile();
    var ref=(String(p.code||'MEG').toUpperCase())+'-LOEC-03';
    var footer='<div class="letter-page-footer"><span>Ref: '+esc3(ref)+' &middot; Version '+S3.loecVersion+' &middot; Statutory basis: Malaysian employment law / Employment Act 1955 where applicable</span><span>Page '+pageIndex+' of '+totalPages+'</span></div>';
    var pageContentHeight=global.PAGE_H_PX-global.PAGE_MARGIN_TOP_PX-global.PAGE_MARGIN_BOTTOM_PX;
    return '<div class="letter-page force-break" style="height:'+pageContentHeight+'px;position:relative;">'+letterheadHtml+pageInnerHtml+footer+'</div>';
  };

  global.getLetterFileName=function(){
    var d=global.gatherLoceData();
    var clean=function(s){return String(s||'').trim().replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\u4e00-\u9fff\-]/g,'');};
    var parts=[String(d.companyCode||'').toUpperCase(),'LOEC',d.name,d.jobTitle,text('letterDate')].filter(Boolean).map(clean);
    return parts.join('_')||'MEG-EAF_Employment_Contract';
  };

  var oldCompanyChange=global.onEafCompanyChange;
  global.onEafCompanyChange=function(){
    var r=typeof oldCompanyChange==='function'?oldCompanyChange.apply(this,arguments):undefined;
    renderProfilePanel();
    try{ if(global.isAdmin&&typeof global.renderAppointmentLetter==='function') global.renderAppointmentLetter(); }catch(e){}
    return r;
  };

  var oldCollect=global.collectFormData;
  global.collectFormData=function(){
    var d=typeof oldCollect==='function'?oldCollect():{};
    d.v3Schema='3.0-stage3';
    var p=companyProfile();
    d.v3LoecVersion=S3.loecVersion;
    d.v3LegalEmployerCode=p.code;
    d.v3LegalEmployerName=p.name;
    d.v3LegalEmployerMasterDataStatus=p.reviewStatus;
    d.v3EmploymentType=employmentType();
    d.v3TotalFixedMonthlyRemuneration=totalFixed();
    d.v3OtCategory=otCategory();
    d.v3JdReference=jdReference();
    return d;
  };

  var oldValidate=global.validatePrint;
  global.validatePrint=function(){
    var errs=typeof oldValidate==='function'?oldValidate():[];
    if(global.isAdmin && !profileVerified()){
      var target=byId('companySelect')||byId('v2Stage3Profile');
      var msg='Legal Employer master data must be centrally verified before final LOEC issue for '+companyProfile().name+'.';
      if(typeof global.markErr==='function' && target && target.tagName && target.tagName.toLowerCase()!=='div') errs.push(global.markErr(target,msg));
      else errs.push(msg);
    }
    return errs;
  };

  function refreshVersion(){
    global.FORM_VERSION='MEG-EAF V2 HR · Stage 3 · v2026.09.10-21:29';
    if(byId('formRef')) byId('formRef').textContent=global.FORM_VERSION;
    if(byId('loginVersionStamp')) byId('loginVersionStamp').textContent=global.FORM_VERSION;
  }

  function init(){ installStyles(); insertPanel(); renderProfilePanel(); refreshVersion(); try{ if(global.isAdmin&&typeof global.renderAppointmentLetter==='function')global.renderAppointmentLetter(); }catch(e){} }
  init();
})(window);
