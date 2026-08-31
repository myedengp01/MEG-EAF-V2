# MEG-EAF V2 — Multi-Entity Employment & Onboarding Foundation

This is a **development clone / controlled V2 upgrade** of the existing MEG-EAF. It is intentionally designed so the current V1 can remain stable while V2 is tested.

## What V2 adds in this build

1. **Entity-aware Employment Application**
   - Legal employer selection remains `meg / meh / hds / abn`.
   - Applicant job choices prefer the V2 applicant-safe RPC `eaf_v2_public_positions()`, which exposes only approved position metadata from the JD master.
   - The applicant never receives salary bands, competencies, internal notes or other HR-only JD data through this vacancy endpoint.
   - If the staging migration/RPC is not available, V2 falls back to the existing JD read path and then to safe local compatibility lists; Aborne does not assume unapproved official job titles.
   - Company name is carried through application wording and submission confirmation.
   - V1 `payload.companyCode` compatibility is retained.

2. **Entity-aware HR dashboard**
   - Company filter for applications.
   - Legal employer is displayed on application cards and summary reporting.
   - Existing V1 application records default to `meg` if no `companyCode` exists.

3. **JD Master integration**
   - The existing `jd_entities / jd_departments / jd_positions / jd_responsibilities` structure is the preferred source of truth.
   - HR Approved Job Title is populated from the selected entity when JD data is available.
   - Appendix 1 is generated from the selected JD.
   - JD reference is shown in the LOEC and persisted with V2 fields.
   - V1 `POSITION_REGISTRY` remains as a compatibility fallback during migration.

4. **Combined Letter of Offer & Employment Contract (LOEC)**
   - Preserves the current model: **one combined agreement**.
   - Employee reviews the complete LOEC + Appendix 1 and signs once to accept the offer and employment contract together.
   - Manual / wet-ink signing only; no e-sign contract function.
   - Entity-specific footer prefixes: `MEG`, `MEH`, `HDS`, `ABP`.
   - Entity-aware handbook / event clauses for Happy Dino and Aborne.
   - Corrected service-based statutory sick leave table (14 / 18 / 22 days + 60 hospitalisation days).
   - Benefits wording is policy-based instead of promising benefits that may not apply to every entity.
   - Probation and probation notice are configurable; Happy Dino and Aborne are intentionally left without assumed defaults until Management confirms them.
   - Basic salary, fixed contractual allowance, other contractual allowance and total fixed monthly remuneration are supported.
   - HR must classify statutory OT / additional work treatment rather than the app inferring it from job title.

5. **Manual signing record + document control**
   - LOEC lifecycle: Draft → Issued → Signed PDF Uploaded → Verified → Stamp tracking → Completed.
   - Signed PDF is uploaded as a record copy after manual signing. Employee signed date, employer signed date and employer signatory are required before upload.
   - Signed agreement and stamp-certificate storage objects are immutable in V2: they have INSERT/SELECT policies only, with no UPDATE/DELETE policy. A replacement uses a new LOEC revision.
   - Physical original receipt/location can be recorded.
   - Issued employment terms are frozen as a JSON snapshot; V2 warns if HR changes terms after issue.
   - Superseded documents remain in history; new revision is created instead of silently replacing an issued agreement.

6. **Stamp tracking**
   - Pending / Submitted / Stamped / Not Required.
   - Stamp due date / internal HR target, submission date, completion date, reference and stamp certificate upload.
   - V2 can suggest an internal target 30 days after the later manual signature date; HR remains responsible for confirming the applicable statutory deadline for the actual instrument/circumstances.

7. **Audit foundation**
   - Supabase migration adds LOEC audit history automatically through database triggers.

## Important: staging first

Do **not** replace the current production MEG-EAF with this build immediately.

Recommended:

1. Keep V1 as current production.
2. Deploy this folder as a separate V2 staging site.
3. Use a staging Supabase project or a verified staging copy of the schema/data.
4. Apply `supabase/migrations/001_meg_eaf_v2_loec.sql` to staging. This also installs the applicant-safe published-vacancy RPC and private immutable LOEC storage policies.
5. Test all four legal employers with dummy applicants.
6. Populate/approve Aborne JDs in the JD master before publishing Aborne vacancies.
7. Confirm Happy Dino and Aborne default probation duration + probation notice before production cutover.
8. Verify the current company master contact details, especially Aborne's current email, before issuing live employment agreements.

## V1 compatibility

The V2 front end still reads/writes the original JSON payload. The migration adds a first-class `company_code` column, synced from `payload.companyCode`, without removing the original value.

## Files added

- `v2-applicant-extension.js`
- `v2-hr-extension.js`
- `supabase/migrations/001_meg_eaf_v2_loec.sql`
- `README_V2.md`
- `V2_TEST_CHECKLIST.md`

The original V1 backup HTML files in the repository have intentionally been left unchanged.

## Build 02 staging hardening

After migration `001_meg_eaf_v2_loec.sql`, apply:

- `supabase/migrations/002_meg_eaf_v2_hardening.sql`

Build 02 moves the most important document-control rules from UI-only safeguards into the database. In particular, issued terms are frozen, signed-record metadata cannot be rewritten after upload, completed status requires a resolved stamp state, and creation of a replacement LOEC revision is atomic when the Build 02 RPC is installed.

The intended lifecycle is now enforced as:

`Draft → Issued → Signed PDF Uploaded → Stamp Pending (after HR verification) → Completed`

A record can also be completed from Stamp Pending with `Stamp Status = Not Required`. Replacement agreements use `Superseded → New Draft Revision`; the historical revision remains retained.
