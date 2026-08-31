# MEG-EAF V2 — Build 02 Staging Deployment

Build: **2026-08-31-02**

## Scope

This is a staging-only controlled upgrade. Keep the current V1 production deployment untouched until the full acceptance checklist is completed.

## 1. Deploy frontend separately

Deploy the complete `MEG-EAF-V2` folder to a separate staging path/site. Do not overwrite the live V1 site.

The active V2 files remain:

- `index.html` + `v2-applicant-extension.js`
- `hr.html` + `v2-hr-extension.js`
- `jd-manual.html`
- `dashboard.html`

V1/base HTML and historical backups have intentionally not been edited by Build 02.

## 2. Supabase migration order

Use a staging Supabase project or verified staging copy of the production schema/data.

Run in this exact order:

1. `supabase/migrations/001_meg_eaf_v2_loec.sql`
2. Check that there is no more than one active LOEC revision per application:

```sql
select application_id, count(*) as active_count
from public.eaf_loec_records
where status not in ('superseded','cancelled')
group by application_id
having count(*) > 1;
```

Expected result: **0 rows**.

3. `supabase/migrations/002_meg_eaf_v2_hardening.sql`

Migration 002 adds the database guard and the atomic `eaf_v2_create_loec_revision(...)` RPC.

## 3. Basic database verification

```sql
select company_code, status, count(*)
from public.eaf_loec_records
group by company_code, status
order by company_code, status;
```

```sql
select proname
from pg_proc
where proname in ('eaf_v2_public_positions','eaf_v2_create_loec_revision');
```

Expected: both V2 RPC names are present.

## 4. Acceptance flow per legal employer

Run one dummy application for each:

- MEG — MyEden Group Sdn. Bhd.
- MEH — MyEden Edu Hub Sdn. Bhd.
- HDS — Happy Dino Sdn. Bhd.
- ABN — Aborne Project Sdn. Bhd.

For each dummy record:

`Application → HR Review → Employment Terms → Combined LOEC → Mark Issued → Print/Manual Wet Signature → Upload Signed PDF → HR Verify → Stamp Pending → Stamp Certificate / Not Required → Completed`

Then deliberately test one replacement agreement using **Supersede → New Revision** and confirm the previous revision remains in history.

## 5. Permission tests

Test with separate accounts where possible:

- Admin/Super Admin
- View Applications only
- Generate Letter
- Edit Office Use
- Newly self-registered staff with zero permissions

Confirm unauthorised users cannot create/update LOEC records or upload record-copy PDFs.

## 6. Inputs intentionally not guessed

Before production cutover, Management still needs to finalise:

- Happy Dino default probation duration and probation notice.
- Aborne default probation duration and probation notice.
- Approved Aborne JD master records / official role architecture.
- Current legal-employer contact data, especially Aborne email/address fields.

Until those are confirmed, HDS/ABN probation defaults remain blank and Aborne does not publish invented fallback job titles.

## 7. Production cutover gate

Do not cut over V1 until:

- all staging migrations pass;
- all four employer dummy lifecycles pass;
- RLS/storage permission tests pass;
- Aborne JDs and company master data are approved;
- HDS/ABN probation defaults are confirmed;
- `V2_TEST_CHECKLIST.md` is completed.
