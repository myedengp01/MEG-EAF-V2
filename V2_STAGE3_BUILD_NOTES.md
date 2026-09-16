# MEG-EAF V2 — Stage 3 Build

Build: **v2026.09.10-21:29**  
Source baseline: **MEG-EAF V2 Stage 2 v2026.09.10-20:05**

## Stage 3 scope

Stage 3 implements the **Multi-Entity LOEC Engine** on top of the validated Stage 2 Employment Terms + JD Master layer. The change is additive: `v2-stage3-loec.js` loads after `v2-stage2-hr.js` and overrides only the LOEC-facing rendering/data hooks required for Stage 3.

## Implemented

- Added legal-employer-aware LOEC rendering for:
  - MyEden Group Sdn. Bhd. (MEG)
  - MyEden Edu Hub Sdn. Bhd. (MEH)
  - Happy Dino Sdn. Bhd. (HDS)
  - Aborne Project Sdn. Bhd. (ABN)
- LOEC Page 1 now binds the selected legal employer name and registration profile.
- Entity-specific LOEC footer reference is generated (`MEG-LOEC-03`, `MEH-LOEC-03`, `HDS-LOEC-03`, `ABN-LOEC-03`).
- LOEC version advanced to **2.0**.
- Stage 2 Employment Terms are now rendered into the LOEC:
  - Employment Type
  - Fixed-Term End Date where applicable
  - Probation Period
  - Probation Notice
  - Statutory OT / Additional Work classification
  - Applicable Handbook
  - Normal Off Day
  - Normal Rest Day
- Fixed remuneration is now rendered as:
  - Basic Salary
  - Fixed Contractual Allowance
  - Other Contractual Allowance
  - Total Fixed Monthly Remuneration
- JD binding is reflected in the LOEC and Appendix 1:
  - resolved position
  - level
  - JD reference
  - Appendix 1 responsibilities/purpose from Stage 2
- Signature block now names the exact selected legal employer.
- LOEC filename now uses legal-employer code + resolved job title rather than a raw JD selector value.
- Added Stage 3 payload metadata without overwriting the Stage 2 payload schema marker.

## Statutory wording updates verified against official Malaysian sources on 10 September 2026

- Employment Act 1955 / JTKSM:
  - normal weekly working hours reduced to 45 hours;
  - paid sick leave entitlement is 14 days (<2 years), 18 days (2–<5 years), 22 days (5+ years), plus 60 days paid hospitalisation leave;
  - maternity leave 98 days and eligible paternity leave 7 days remain statutory features;
  - overtime-payment eligibility depends on the First Schedule/statutory category; employees earning above RM4,000 who are not manual employees are generally outside specified overtime/rest-day/paid-holiday monetary provisions.
- HASiL / Stamp Act 1949 employment-contract guidance:
  - employment contracts executed from 1 January 2026 are generally subject to RM10 stamp duty;
  - if executed in Malaysia, stamping is generally required within 30 days from signing;
  - late stamping may attract the applicable penalty.

Stage 3 therefore replaces the older hard-coded “14 days sick leave for all service lengths” wording and updates the stamp-duty clause for 2026 execution.

## Legal-employer master-data issue gate

The company master data currently embedded in `hr.html` originates from the pre-Stage-3 source. Stage 3 deliberately marks **all four legal-employer profiles as `review_required`** until Management compares them against current SSM/company records.

- LOEC preview remains available.
- Preview shows `MASTER DATA REVIEW REQUIRED — STAGING PREVIEW — NOT FOR ISSUE`.
- Final `Print LOEC` validation is blocked until the selected legal-employer profile is centrally marked verified.
- Aborne is specifically flagged because the inherited source currently uses `whitefeatherentmt2022@gmail.com`.

See `V2_STAGE3_MASTER_DATA_CHECKLIST.md`.

## Preserved from Stage 2

The following Stage 2 files are byte-for-byte unchanged:

- `index.html`
- `dashboard.html`
- `jd-manual.html`
- `manifest.json`
- `service-worker.js`
- `supabase_v2_stage1_company_code.sql`
- `v2-entity-core.js`
- `v2-stage2-hr.js`
- all files under `V1-SNAPSHOTS/`
- Stage 1 and Stage 2 build/validation notes

`hr.html` changes only by loading the new Stage 3 module after Stage 2.

## Deliberately NOT implemented in Stage 3

- Production Supabase migration has NOT been run.
- Live authenticated Supabase/RLS integration has NOT been executed from this build environment.
- No Aborne official JD architecture has been invented.
- Signed LOEC PDF upload / verification / immutable document storage is NOT built yet.
- Stamp certificate upload / stamp-status tracking is NOT built yet.
- Handbook assignment / read acknowledgement tracking is NOT built yet.
- No legal-employer profile is marked verified automatically.

## Validation

- Static/integrity checks: **54 PASS / 0 FAIL**.
- Isolated Stage 3 JavaScript runtime smoke: **1 PASS / 0 FAIL**.
- Combined build validation: **55 PASS / 0 FAIL**.
- Full local browser staging and live Supabase/RLS verification are still required before production cutover.
