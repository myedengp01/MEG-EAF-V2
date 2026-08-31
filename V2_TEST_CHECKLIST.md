# MEG-EAF V2 — Acceptance Test Checklist

Run these tests in **staging** before production cutover.

## A. Applicant form / legal employer

- [ ] Select MyEden Group → MyEden branding and MyEden JD choices.
- [ ] Select MyEden Edu Hub → Edu Hub branding and appropriate JD catalogue/fallback.
- [ ] Select Happy Dino → Happy Dino branding and only Happy Dino approved JD choices/fallback.
- [ ] Applicant vacancy RPC exposes only approved position metadata; no salary band/internal JD data appears in applicant network response.
- [ ] Select Aborne → Aborne branding; no MyEden/Happy Dino roles are shown as official Aborne roles if Aborne JD master is empty.
- [ ] Relative/friend wording reflects selected legal employer.
- [ ] Declaration reflects selected legal employer.
- [ ] Submission confirmation names selected legal employer.
- [ ] Submitted payload contains `companyCode` and V2 JD identifiers where available.
- [ ] Existing V1 draft can still be reopened.

## B. HR dashboard

- [ ] Application list shows legal-employer chip.
- [ ] Company filter correctly isolates MEG / MEH / HDS / ABN.
- [ ] Summary report includes Legal Employer column.
- [ ] Old V1 records without company code remain readable (default MEG).

## C. JD integration

- [ ] Sign in as HR and open JD Manual.
- [ ] HR job-title dropdown loads positions belonging to selected entity.
- [ ] Changing company refreshes job choices.
- [ ] Selected JD auto-fills Department and Appendix 1.
- [ ] JD reference appears in V2 Employment Terms and LOEC Appendix.
- [ ] Manual JD override still works where authorised.
- [ ] Aborne vacancies are populated only after approved Aborne JD records are added.

## D. Employment terms

- [ ] Employment Type required.
- [ ] Fixed-Term End Date required only for Fixed-Term Full-Time.
- [ ] Probation period required.
- [ ] Probation notice amount/unit required.
- [ ] HDS/ABN do not silently assume unconfirmed probation values.
- [ ] Basic salary mirrors existing approved salary.
- [ ] Fixed and other contractual allowances calculate Total Fixed Remuneration correctly.
- [ ] OT / Additional Work Category required.
- [ ] Applicable handbook, Off Day and Rest Day are correct per company.

## E. Combined LOEC

- [ ] One document titled Letter of Offer & Contract of Employment.
- [ ] Text states signing accepts offer + employment contract together.
- [ ] Correct company name, registration number, registered address and letterhead.
- [ ] Correct entity footer prefix (MEG / MEH / HDS / ABP).
- [ ] Job title/JD reference correct.
- [ ] Probation and probation notice match HR selection.
- [ ] Salary/allowances/total fixed remuneration match HR fields.
- [ ] Sick leave table shows 14/18/22 + 60 hospitalisation.
- [ ] HDS contract includes event/child-safe/uniform clauses.
- [ ] ABP contract includes event/client/financial duties, event-specific attire and zero alcohol exception.
- [ ] Manual signature block is blank for wet-ink signatures.
- [ ] Appendix 1 is included in the same agreement package.

## F. LOEC document control (after migration)

- [ ] Create LOEC Record creates unique document ID.
- [ ] Mark Issued validates all required employment terms and stores/fixes the terms snapshot.
- [ ] Issued/progressed LOEC cannot be reset to draft by the Create/Refresh button.
- [ ] Changing an issued term shows drift warning.
- [ ] Signed PDF upload accepts PDF only and stores private object.
- [ ] Employee signed date, employer signed date and employer signatory are required before signed PDF upload.
- [ ] Re-upload/overwrite of the same signed LOEC object is rejected; replacement requires a new revision.
- [ ] HR verification requires uploaded signed PDF.
- [ ] Employee signed date / employer signed date recorded and locked after verification.
- [ ] Physical original received/location can be stored.
- [ ] Stamp status/due date/reference/submission/completion dates can be stored.
- [ ] Stamp certificate upload is blocked until the signed LOEC is HR-verified.
- [ ] Stamp certificate uploads successfully and cannot be overwritten in the same revision.
- [ ] Supersede creates new revision and preserves old record.
- [ ] Audit table records LOEC changes.

## G. Security / permissions

- [ ] Applicant cannot access HR LOEC record table/storage.
- [ ] Signed documents are not public.
- [ ] HR without appropriate permissions cannot edit/generate LOEC records.
- [ ] Existing HR permissions continue to work.
- [ ] Service worker does not cache sensitive signed PDFs.

## H. Cutover

- [ ] V1 snapshot/backup retained.
- [ ] Production database backup completed.
- [ ] Company master data verified.
- [ ] HDS/ABN probation defaults confirmed.
- [ ] Aborne JD master approved/populated.
- [ ] At least one complete dummy employment lifecycle tested per legal employer.

## H. Build 02 hardening tests

- [ ] Apply `002_meg_eaf_v2_hardening.sql` after migration 001 in staging.
- [ ] Attempt to change issued `terms_snapshot` directly through REST/SQL as normal HR user → rejected.
- [ ] Attempt to change signed PDF path or signature dates after upload → rejected.
- [ ] Verify signed agreement → status becomes `stamp_pending` and verification metadata is stored.
- [ ] Stamp Status `Submitted` → remains `stamp_pending` and submission date is retained.
- [ ] Stamp Status `Not Required` after verification → status becomes `completed`.
- [ ] Stamp certificate upload after verification → status becomes `completed`, stamp status `stamped`.
- [ ] Supersede current revision → old record remains historical and exactly one new active draft revision is created.
- [ ] Attempt invalid lifecycle rollback (e.g. `completed → draft`) → rejected by database.
- [ ] Attempt storage upload outside the controlled LOEC path pattern → rejected.
