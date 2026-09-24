# MEG-HR-LMS V1.0 — approved implementation record

Target UVN: `v2026.09.21-14:30`. Development branch: `feature/hr-letters-v2026-09-21-1430`. Production is NOT deployed by this document.

## Approved scope
15 templates: LOC, LOI, LOP, SCL, PEL, WL, PIP, RL, TL, TRL, UAL, SAL, DI, EL, and combined LOC+LOI. No MVC. Preserve existing V1/V2 and existing employee records. New HR Letters card in `dashboard.html` must use existing gateway authentication and new `hr_letters` application permissions, with database-enforced employee/company scoping and separate salary/disciplinary access. Do not merely add a visible card before gateway RPC, app registry, RLS and destination route are ready.

## Architecture confirmed from repository
`dashboard.html` is a static HTML gateway; it declares `APP_ORDER`, `APP_META`, and invokes `eaf_v2_gateway_my_access` to decide card visibility. Current gateway client version is `v2026.09.04-19:30`. Do not assume Next.js structure or edit `myeden-os` for this module.

## Implementation order (single release)
1. Inventory current Supabase migrations and actual schema, employee ID types, LOEC snapshot, leave balances, JD versions, existing gateway app permissions, RLS and deployment. Verify backup and rollback. Never use `final_salary` as basic salary without field-definition validation.
2. Add additive, idempotent migrations for template versions, letter drafts, approval decisions, attachment metadata, immutable issued snapshots, audit events and app permission registration. Implement RLS for employee own-issued records, HR company scope, approver DAL, admin and confidential case/salary restrictions. No automatic status/payroll changes on draft edits.
3. Build shared letter engine and the 15 approved templates. Fetch source values with explicit provenance, allow authorised editable overrides with reason and audit. Salary percentage/fixed increment calculation; probation alerts; notice/leave calculations with HR verification; promotion JD appendix frozen at approved version; SCL/DI allegation and evidence handling. No automated disciplinary findings.
4. Add a new HR Letters dashboard card and destination only after gateway access RPC and destination enforce permissions. Preserve the existing four cards and styling; update version strings together.
5. Test anonymous/employee/manager/HR/admin isolation, company scoping, salary/disciplinary restrictions, all templates, leave/notice boundary dates, approvals, PDF/archive and rollback. Stage and obtain passing evidence before production migration and main merge.

## Release gates
Do not issue letters, mutate payroll or expose confidential records until permissions and end-to-end tests pass. No claim of live deployment without confirmed migration, commit, deploy URL and smoke test. Existing `main` stays unchanged until all gates pass.

## Draft preview race fix — 2026-09-24

A pending preview previously checked only employee/template IDs. Editing a field while waiting, or switching employee/template away and back, could let an obsolete response enable Save Draft. The workspace now advances a preview revision whenever inputs/selections are invalidated and before each preview request. Stale successes and errors are discarded; a fresh preview is required before saving. Regeneration also clears an earlier valid preview before the request starts. Outdated template-field errors no longer replace the current selection status.

`tests/hr-letters-preview.mjs` executes the actual workspace script with dummy DOM/HTTP responses and deliberate response delays. It covers field edits, employee/template changes away and back, stale errors, rejected saves without a current preview, current-field saving after a valid preview, and failure while regenerating. The complete `npm test --prefix tests` suite passes. This is a local regression check, not full-app browser or production validation. No letters, employees, permissions or database objects were changed by these tests.
