# HR Letters field mapping audit — 2026-09-24

Status: release blocked pending verified salary semantics and implementation of company-name resolution. Inspection was read-only; no employee values, roles, database definitions or issued letters were changed.

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

## Remaining work

- Confirm salary semantics/source, then implement and test consistent server/UI mappings.
- Test all four entity codes, unknown/inactive entities, blank salary, permission denials and malicious client overrides with dummy records.
- Verify preview → saved draft → submitted frozen text consistency and preservation of issued records.
- Keep PR #1 draft and production unchanged until these and the existing release gates pass.

