# EDP letter workspace update — 26 September 2026

## Done
- User screenshot confirms ordinary test target displays User; Administrator and protected Super Administrator remain distinct. No actual-user role assignment.
- Employee directory now returns authoritative current basic salary (final_salary, monthly basic excluding allowances). Zero remains visible; missing stays missing.
- LOC_LOI and LOI gross salary rows/placeholders removed by a drift-checked migration. LOC_LOI uses the employee's company name. Existing letter snapshots and active flags are unchanged.
- Requested employee/basic salary/date order; salary forms including promotion share calculation controls. Increment percentage and revised basic are automatically calculated and remain editable. Changing increment or employee recalculates both.
- Sticky dashboard navigation and collapsible top actions; company letterhead selection restricted server-side to employing company. Existing company logo/contact assets reused.
- Print / Save PDF uses browser printing with company letterhead and draft marking. Share uses the device share chooser (WhatsApp if available), otherwise copies text for manual pasting. Nothing is automatically sent.
- Issued-letter review accepts a selected scanned PDF/JPG/PNG up to 10 MB. It uses the private employee-documents bucket and existing document permission RPC. New registration checks HR administrator, issued status, employee folder, upload ownership, stored MIME/size and duplicates; employee event and letter audit are atomic. Uncertain responses retain the uploaded object for reconciliation rather than risk deleting a committed document.

## Verification
- Full test suite passes, including 38 existing role/database checks, form races, actual-script manual override checks, new basic-only migration/idempotence/drift checks, signed-copy permissions/metadata/audit/duplicate tests and upload failure behavior.
- Real staging browser: ten LOC_LOI inputs in requested sequence, current basic 2300, increment 200 -> 8.70% / 2500.00, manual revised basic 2510 retained in fresh preview, no gross row, sticky navigation top=0 while scrolled, Hide actions works.
- Staging migrations applied only to fjesgcsumbuniatyaeee. No production migration or UI deployment.
- Actual staging Storage upload plus protected registration passed. Disposable issued letter: 83ee0c06-92b6-4e7e-8ac8-7c4329bc3bf1; document: 16ca6f21-a51f-44d3-9291-e2b6b6db938c. The image is explicitly named EDP-DISPOSABLE-UPLOAD-TEST-NOT-A-SIGNATURE.png. It is not an actual signed letter. Correct dummy employee and one audit in each system verified.
- Test browser/API sessions signed out. User's test accounts remain enabled for ongoing acceptance.

## Staging fixture and cleanup
- Added minimal employee_documents/employee_events test tables, captured production register_employee_document RPC, private bucket and matching insert permission predicate. Test fixture includes own-profile column access and administrator employee-ID read needed by that predicate. Production policies unchanged.
- Dummy employee EDP-DUMMY-001 basic salary changed from 0 to 2300 for calculation testing.
- Only edp-test-admin@example.invalid received can_edit_office_use in its legacy test profile for signed-copy testing. Restore this dummy flag to false when testing finishes. Do not alter real profiles.
- Keep disposable issued record, uploaded image and audits as test evidence. Disable disposable accounts and clear their test sessions after Irene finishes; restore dummy target to User and remove local temporary credentials. Do not remove unrelated data.

## To do before release
- Irene's acceptance of printed/PDF layout, device share chooser and signed-copy file selection; native browser print/share/file-picker flows have not been automated end-to-end.
- Existing full-app approval/issuance confirmation and mobile acceptance checks remain open.
- Keep PR #1 draft. No merge or production deployment until release verification/approval.
