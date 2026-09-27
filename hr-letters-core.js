/* MEG-HR-LMS V1.0 — v2026.09.21-14:30
 * Pure calculations only. This module does not access employee data, approve letters,
 * change payroll or determine statutory entitlements. All results require HR review.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MEGHRLettersCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function money(value, label) {
    var n = Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < 0) throw new Error((label || 'Amount') + ' must be a nonnegative finite number');
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  function salaryIncrement(currentBasic, mode, value) {
    var basic = money(currentBasic, 'Current basic salary');
    var input = money(value, 'Increment');
    if (mode !== 'percentage' && mode !== 'fixed') throw new Error('Increment mode must be percentage or fixed');
    var amount = mode === 'percentage' ? money(basic * input / 100, 'Increment amount') : input;
    var revised = money(basic + amount, 'Revised basic salary');
    return { currentBasic: basic, mode: mode, percentage: basic === 0 ? null : Math.round((amount / basic * 100 + Number.EPSILON) * 10000) / 10000, incrementAmount: amount, revisedBasic: revised, requiresApproval: true };
  }
  function isoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must be YYYY-MM-DD');
    var parts = value.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (d.getUTCFullYear() !== parts[0] || d.getUTCMonth() !== parts[1] - 1 || d.getUTCDate() !== parts[2]) throw new Error('Invalid calendar date');
    return d;
  }
  function dateString(date) { return date.toISOString().slice(0, 10); }
  /* An indicative calendar calculation only. The contract controls whether notice
   * begins on receipt/the next day and whether it is expressed in calendar units.
   * Months clamp to the final day of shorter months, subject to HR verification. */
  function indicativeNoticeEnd(startDate, quantity, unit, includeStartDay) {
    var start = isoDate(startDate);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Notice quantity must be a positive integer');
    if (!['days', 'weeks', 'months'].includes(unit)) throw new Error('Unsupported notice unit');
    var offset = includeStartDay ? -1 : 0;
    if (unit === 'days' || unit === 'weeks') start.setUTCDate(start.getUTCDate() + quantity * (unit === 'weeks' ? 7 : 1) + offset);
    else {
      var day = start.getUTCDate();
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() + quantity);
      var max = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
      start.setUTCDate(Math.min(day, max) + offset);
    }
    return { indicativeLastEmploymentDate: dateString(start), requiresHRVerification: true, physicalLastWorkingDay: null, noticeSource: 'contract-required' };
  }
  return Object.freeze({ salaryIncrement: salaryIncrement, indicativeNoticeEnd: indicativeNoticeEnd });
}));
