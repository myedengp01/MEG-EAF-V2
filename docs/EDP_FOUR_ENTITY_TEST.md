# Four-entity staging test — 27 September 2026

Done:
- Added EDP-DUMMY-HD (Happy Dino), EDP-DUMMY-ABP (Aborne Project), EDP-DUMMY-MEH (Myeden Edu Hub), each with TEST ONLY department, Test Position and RM2300 basic salary.
- IDs end ed02/ed03/ed04 respectively. Existing MEG dummy retained.
- Added HD/MEH staging entity records and activated the existing ABP staging entry (previously inactive) to allow company-name resolution. No production data or roles changed.
- Verified authenticated administrator directory/LOI preview for all four company codes, matching company names and no missing fields using supplied dummy values. Verification transaction rolled back; no test letters created.
- Added two line-heights of padding above Employee Acknowledgement in the shared live/print stylesheet. All 15 renderer checks pass; staging UI rebuilt.

To do:
- Refresh staging and select each dummy employee to test its automatic letterhead.
- Restore ABP staging is_active=false during eventual fixture cleanup if no longer required; track the new HD/MEH entities and three employees as disposable fixtures. Retain any dependent test-letter audit evidence rather than deleting blindly.
- Keep PR #1 draft; no merge or production deployment.
