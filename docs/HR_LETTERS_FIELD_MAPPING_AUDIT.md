# HR Letters field mapping audit — 2026-09-24

Status: company-name fix implemented and tested locally on 2026-09-25; release remains blocked pending staging validation and verified salary semantics. Live inspection was read-only; no live employee values, roles, database definitions or issued letters were changed.

## Company name

`hr_letters_admin_preview` currently assigns `employee_master.company_code` to `company_name`. The draft workspace displays the same code under the Company Name field. A short code is not the company's full name.

The existing active `jd_entities` register contains these exact code/name pairs:

| Employee/company code | Registered entity name |
| --- | --- |
| MEG | MYEDEN Group Sdn. Bhd. |
| HD | Happy Dino Sdn. Bhd. |
| MEH | MyEden Edu Hub Sdn. Bhd. |
| ABP | Aborne Project Sdn. Bhd. |

The existing EAF company configuration in `hr.html` has corresponding names (MEG capitalization differs), but uses lowercase `meg`, `hds`, `meh`, `abn` UI codes. The onboarding importer accepts normalized Employee Master codes `MEG`, `HD`, `ABP`, `MEH`. Do not join `hds` or `abn` directly to Employee Master codes or silently substitute MEG for an unknown code.

Proposed implementation requirements: resolve the full name server-side from the existing entity register; use the same resolved name in field metadata and preview; reject missing, inactive or ambiguous matches instead of printing the code; preserve the company code for record ownership/scoping; retain the resolved name in the submitted frozen text. Existing issued snapshots must not be rewritten. No company mapping migration has been applied.

## Current basic salary

`hr_letters_admin_preview` currently populates `current_basic` from `employee_master.final_salary`. The Employee Master schema has no `basic_salary` column and no explanatory comment on `final_salary`.

The inspected chain is:

1. `hr.html` labels the source input `finalSalary` as **Final Approved Salary (RM)**.
2. `prepare_eaf_onboarding_handoff` converts that input to `eaf_onboarding_handoffs.final_salary`.
3. `import_eaf_handoff_to_employee` copies the amount to `employee_master.final_salary`.
4. `update_employee_profile_audited` can later replace `final_salary` with an audited manual value.

This establishes provenance, but does not establish that the amount is monthly basic salary excluding allowances. The approved implementation record explicitly prohibits treating final salary as basic salary without definition validation. The salary mapping is therefore **not verified**. No actual employee salary amounts were needed or fetched for this audit.

Irene must confirm whether this field always means monthly basic salary excluding allowances, or identify the verified source and its effective-date rule. Until then, do not mark salary letters ready for release, infer basic salary from final salary, or introduce editable client overrides as a substitute for verification.

## Implemented company fix — 2026-09-25

Pending migration `20260924044224_hr_letters_company_names.sql` uses a private, administrator-gated resolver over `jd_entities`. Exactly one matching, active, nonblank entity name is required; matching normalizes code casing and outer spaces. Missing, inactive, blank or ambiguous matches return no directory name and reject preview generation. Client-supplied company names cannot override the resolved value. The employee directory includes `company_name`, and the UI displays it read-only without a code fallback. Existing company codes remain unchanged for record scoping.

The LOC_LOI template has fixed MEG wording, so previews/submissions using that template are rejected for other entity codes until separately reviewed wording exists. The migration does not rewrite templates or existing letter snapshots. Salary behavior is unchanged and remains unverified; this is not release approval.

Local PGlite tests cover all four company names, normalized codes, directory/preview consistency, spoofed fields, invalid entity cases, MEG-only combined wording, anonymous/non-admin denial, restricted helper ACLs, repeat migration, and preservation of submitted frozen text after the entity name changes. UI tests confirm a full read-only name and no fallback for missing mappings. Run `npm test --prefix tests`. The migration was generated using Supabase CLI 2.81.3; it has not been applied to staging or production. Apply the database change before releasing the matching UI, after review.

## Remaining work

- Confirm salary semantics/source, then implement and test that mapping, including blank salary cases.
- Verify the company-name migration and matching UI against the full staging app.
- Local issued-record regression passed on 2026-09-25: a distinct dummy super administrator approves/issues the frozen submitted text after entity drift. Issued record, rendered view and audit remain unchanged after source edits and migration rerun; update/delete attempts are denied. Full-app staging acceptance remains open.
- Keep PR #1 draft and production unchanged until these and the existing release gates pass.
