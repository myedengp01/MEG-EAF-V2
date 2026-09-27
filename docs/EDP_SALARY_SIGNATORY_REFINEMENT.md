# Salary and signatory refinement — 27 September 2026

## Done
- Salary form values normalise to two decimal places on leaving the input. Salary amounts and percentages render with two decimals; amounts use thousands separators. Dates and employee IDs are untouched.
- LOI template now contains Increment (%) between Increment and Revised. The existing editable automatic percentage field populates this column. Zero/missing current salary retains the missing-percentage indicator.
- All 15 templates render one signature line and Authorised Signatory label, followed by Name and Designation. Entered name appears beside Name, without a duplicate loose line.
- Paragraph line height explicitly set to single spacing; paragraph gaps and expanded employee-signature spaces retained. Explicit paragraph rule fixes the workspace's inherited 1.6 line height in live preview.
- New migration changes only preview numeric presentation and the LOI template version/table. Existing frozen letter snapshots and active flags remain unchanged. Old LOI drafts require a fresh draft after the version change.

## Verification
- Full suite passes, including all 15 signatory blocks, decimal formatting/date-ID preservation, missing highlights, migration repeatability, salary percentage column and existing security/workflow tests.
- Staging-only migration applied. Rollback-only dummy preview confirms RM2300.00 / RM250.00 / 10.87% / RM2550.00 with no missing fields.
- Browser measured font size and paragraph line height both 14.6667px; existing signature padding remains 59.4px.
- Staging UI refreshed. Production unchanged; no actual employee records modified.

## To do
- Refresh staging and create a fresh Letter of Increment preview. Check final print/PDF output before release.
- Keep PR #1 draft; no merge or production deployment.
