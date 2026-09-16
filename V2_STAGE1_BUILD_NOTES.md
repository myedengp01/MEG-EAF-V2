# MEG-EAF V2 — Stage 1 Build

Build: v2026.09.10-19:07

## Implemented
- V1 files retained as snapshot copies before V2 modification.
- Company selection is now a first-class UI trigger for company branding, dynamic application wording and company-specific position choices.
- Happy Dino fallback position list uses the approved eight-role L1-L5 architecture.
- Applicant and HR forms attempt to load approved positions from the existing JD Supabase register; if unavailable, they fall back safely.
- Aborne does not invent unapproved job titles: until its JD register is created, the application shows an Aborne-specific “position / role not yet listed” entry.
- HR Dashboard now includes a legal-employer filter and shows the company on each application card.
- Application Summary now includes Company.
- Applicant submit confirmation and declaration wording now follow the selected legal employer.
- Dashboard / manifest / JD Manual are labelled for V2.
- Optional migration SQL adds first-class `company_code` columns while retaining payload compatibility.

## Not yet implemented
- Production Supabase migration has NOT been run.
- Aborne JD architecture has NOT been invented or populated.
- LOEC clause/profile refactor is Stage 3.
- Manual signed-LOEC upload, verification and stamp tracking are later stages.
- Handbook assignment/read tracking is later stage.

## Important master-data check before legal-document issue
The current source code still contains the existing company addresses/emails supplied in V1. In particular, Aborne currently uses `whitefeatherentmt2022@gmail.com`; verify company master data before V2 LOEC goes live.
