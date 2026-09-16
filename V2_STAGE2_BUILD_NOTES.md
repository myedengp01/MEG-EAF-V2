# MEG-EAF V2 — Stage 2 Build

Build: **v2026.09.10-20:05**
Source baseline: **MEG-EAF V2 Stage 1 v2026.09.10-19:07**

## Stage 2 scope

Stage 2 adds the HR-side **Employment Terms + JD Master binding layer** on top of the validated Stage 1 multi-entity foundation. It deliberately stops before the Stage 3 LOEC clause/profile refactor.

## Implemented

- Added `v2-stage2-hr.js` as an additive HR module loaded after `v2-entity-core.js`.
- Added structured HR Employment Terms fields:
  - Employment Type
  - Fixed-Term End Date (conditional)
  - Probation Period
  - Probation Notice amount + unit
  - Statutory OT / Additional Work Category
  - Applicable Handbook reference
  - Normal Off Day / Rest Day
  - JD Reference
- Added fixed-remuneration structure:
  - Basic Salary mirror
  - Fixed Contractual Allowance
  - Other Contractual Allowance
  - Total Fixed Monthly Remuneration
- New Stage 2 fields are persisted inside the existing application/draft JSON payload for backward compatibility; no Stage 2 schema migration is required just to test these fields.
- HR Approved Job Title now prefers the authenticated approved JD Master for the currently selected legal employer.
- JD selection binds the exact approved JD record and auto-populates:
  - resolved job title
  - level
  - department
  - JD reference
  - JD purpose/responsibilities into Appendix 1
  - reporting title where available and currently blank
  - employment type where the JD provides a compatible value and HR has not selected one yet
- Draft/unapproved JD records are excluded from the Stage 2 HR binding list.
- Company change refreshes the legal-employer JD choices and clears stale cross-entity Stage 2 terms that should not silently carry to another employer.
- Work-location choices are legal-employer-aware while preserving legacy stored locations.
- Happy Dino safe fallback retains the approved eight-role career structure with exact levels:
  - L1 Camp Administration & Operations Associate
  - L2 Camp Administration & Operations Executive
  - L3 Senior Camp Administration & Operations Executive
  - L1 Camp Operations & Logistics Associate
  - L2 Camp Operations & Logistics Executive
  - L3 Senior Camp Operations & Logistics Executive
  - L4 Happy Dino Project & Operations Manager
  - L5 Head of Happy Dino / Head of Science Camp Projects
- Aborne does **not** publish invented official roles. If the approved Aborne JD Master is empty, HR sees an explicit pending-JD state with manual HR entry only.
- MEG / MEH retain the existing V2 project probation defaults of 3 months and 4 weeks for HR review.
- Happy Dino / Aborne probation duration and probation notice remain intentionally blank until Management confirms them.
- Stage 2 print validation requires the new structured employment terms to be completed before HR prints an employment document.

## Preserved from Stage 1

- V1 snapshot files remain byte-for-byte unchanged.
- `dashboard.html`, `jd-manual.html`, `manifest.json`, `service-worker.js` and `supabase_v2_stage1_company_code.sql` remain byte-for-byte unchanged.
- Applicant legal-employer branding and company-specific vacancy logic remain intact.
- HR legal-employer filtering and Company summary column remain intact.
- Existing JSON payload compatibility remains intact.
- The Stage 1 optional `company_code` migration remains included but unapplied.

## Deliberately NOT implemented in Stage 2

- Production Supabase migration has NOT been run.
- Live Supabase/RLS integration has NOT been executed from this build environment.
- Aborne JD architecture has NOT been invented or populated.
- Multi-entity LOEC clause/profile refactor remains **Stage 3**.
- Manual signed-LOEC PDF upload, verification, immutable document control and stamp tracking remain later stages.
- Handbook assignment/read acknowledgement tracking remains later stage.

## Legal-employer master-data gate before Stage 3 / live LOEC

The current V1-origin company contact data remains unchanged. Before Stage 3 is allowed to issue entity-specific legal documents, verify the current company registration/address/phone/email master data, especially Aborne's email/address details. The Stage 1 source currently contains `whitefeatherentmt2022@gmail.com` for Aborne.

## Validation

- Static/integrity checks: **33 PASS / 0 FAIL**.
- A full live Supabase/RLS test was not possible in this isolated build environment.
- A headless Chromium runtime harness was attempted, but the container Chromium process did not produce a runnable DOM in this environment; local staging browser verification remains required before any production cutover.
