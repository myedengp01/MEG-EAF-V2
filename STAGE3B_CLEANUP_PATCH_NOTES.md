# MEG-Employment & HR System V2 — Stage 3B Cleanup Patch

UVN: **v2026.09.16-14:00**
Previous tested build: **v2026.09.16-11:17**

## Browser-acceptance corrections applied
1. Applicant visible version normalized to Stage 3B / current UVN.
2. HR visible version normalized to Stage 3B / current UVN.
3. MEG/MEH applicable handbook display name set to `Myeden Education Group Employee Handbook - v2.0`.
4. Visible Appointment Letter terminology normalized to LOEC terminology while preserving legacy function/technical identifiers for compatibility.
5. JD Manual branding normalized to `MEG-Employment & HR System V2`; subtitle set to `Controlled Multi-Entity Job Description Master`.
6. HR Law Tools branding normalized to `MEG-Employment & HR System V2`.
7. Dashboard/gateway visible UVN advanced to v2026.09.16-14:00.
8. PWA display name normalized to the current project name.

## Deliberately not completed in this patch
- Aborne five-role JD database seed / migration.
- Staging Supabase/RLS acceptance.
- Production database migration.
- Signed-LOEC/stamp-control production cutover.
- Handbook assignment/acknowledgement workflow.

## Compatibility rule
Legacy `MEG-EAF`, `MEG-EAF-V2`, file names, database/RLS identifiers, URLs and internal function names are retained where changing them could break backward compatibility.
