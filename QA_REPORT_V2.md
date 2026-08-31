# MEG-EAF V2 — Build QA Report

Automated/static checks passed: **28/28**

> Browser checks were executed in an isolated in-memory page with mocked/offline Supabase responses. No production database or live application records were changed.

- [x] Applicant HDS fallback positions
- [x] Applicant HDS dynamic legal-employer wording
- [x] Applicant ABN does not invent unapproved fallback roles
- [x] Applicant page JS runtime
- [x] Applicant safe RPC drives HDS vacancy/JD ref
- [x] HR V2 employment terms panel injected
- [x] HR V2 LOEC record panel injected
- [x] HR company filter injected
- [x] Stamp due target field exists
- [x] HR profile hds handbook
- [x] HR profile hds probation default
- [x] HR profile abn handbook
- [x] HR profile abn probation default
- [x] HR profile meg handbook
- [x] HR profile meg probation default
- [x] ABN LOEC strict zero hospitality exception
- [x] LOEC sick leave 14/18/22 + 60
- [x] LOEC one combined agreement wording
- [x] ABN footer prefix
- [x] HDS LOEC Child-Safe Event Code
- [x] HDS LOEC mandatory uniform
- [x] HDS footer prefix
- [x] Issued LOEC cannot be reset to draft
- [x] HR page JS runtime
- [x] Migration exposes narrow public vacancy RPC
- [x] Signed storage has no UPDATE/DELETE policy
- [x] First-class company_code migration
- [x] LOEC audit trigger included

## Remaining staging tests

- Apply the included migration to a **staging Supabase project/schema copy**.
- Verify current RLS/permissions against real staff profiles.
- Populate/approve Aborne JD records before publishing Aborne vacancies.
- Confirm Happy Dino and Aborne default probation duration and probation notice before production cutover.
- Verify legal-employer contact master data before issuing live LOECs.
- Complete one dummy end-to-end lifecycle per legal employer, including manual signed-PDF upload and stamp certificate upload.

## Development Build 02 — staging hardening QA

Build 02 additional static/integrity checks: **47/47 passed**.

Also passed JavaScript syntax validation for:

- `index.html` inline JavaScript
- `hr.html` inline JavaScript
- `jd-manual.html` inline JavaScript
- `dashboard.html` inline JavaScript
- `v2-applicant-extension.js`
- `v2-hr-extension.js`

Build 02 specifically verified:

- V1/base HTML and all dated backup HTML files remain byte-for-byte unchanged from Build 01.
- Already-issued LOEC revisions cannot be re-issued from the V2 UI.
- Signed-PDF upload is limited to an issued LOEC revision.
- Signature metadata locks when the signed PDF exists.
- HR verification moves the lifecycle into `stamp_pending`.
- `stamped` and `not_required` resolve the stamp workflow to `completed` after verification.
- Draft records are refreshed rather than superseded into unnecessary revisions.
- Build 02 frontend calls the atomic LOEC revision RPC when installed.
- Migration 002 adds database-enforced frozen snapshots, signed-record immutability, verification immutability, lifecycle transitions, one-active-revision protection and controlled storage paths.
- Signed/stamp storage still has no UPDATE or DELETE policy.

### Still requires real staging validation

These checks cannot be truthfully completed without the staging Supabase project and its real staff/JD data:

- Apply migrations 001 and 002 to staging and verify they execute successfully against the actual schema/data.
- Verify RLS with real Admin / View Applications / Generate Letter / Office Use permission combinations.
- Run one dummy end-to-end lifecycle for each employer: MEG / MEH / HDS / ABN.
- Verify private signed-PDF and stamp-certificate upload/download permissions in the real bucket.
- Populate and approve Aborne JD records before publishing Aborne vacancies.
- Confirm Happy Dino and Aborne default probation duration and probation notice before production cutover.
- Verify current legal-employer master contact data, especially Aborne, before issuing a live LOEC.
