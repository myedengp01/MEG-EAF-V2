# Live incomplete letter preview — 27 September 2026

## Done
- Letterhead is selected automatically from the employee company and locked against accidental mismatches. Existing server validation remains intact.
- Read-only A4-style preview beside the form uses the shared print renderer and supplied company letterhead. Changes refresh after 450 ms without autosaving.
- Unfilled placeholders display as descriptive brackets with light-red highlighting and DRAFT — INCOMPLETE status.
- Explicit Preview lists missing details in a confirmation dialog; Cancel returns to Form, Continue opens the preview. Automatic refresh does not repeatedly prompt.
- Form / Preview panel controls replace the split view below 1000 px. Top actions remain outside the scrolling panes.
- Incomplete drafts can still save. Print/Share remain restricted to complete current previews; submission and approval checks remain unchanged.

## Verification
- Full local suite passes, including delayed response protection, explicit incomplete confirm/cancel, no repeated live prompts or autosave, company synchronization, and safe bracket/highlight rendering.
- Real staging browser verified automatic MEG selection for the dummy employee, warning-letter preview with missing fields, light-red highlight color, read-only content, and typed text replacing its highlighted placeholder.
- No database migration, actual employee changes or production deployment. Native confirmation remains covered by actual-script tests; manual browser dialog acceptance remains part of release checks.

## To do
- Refresh staging and test the live form/preview workflow. Final PDF page breaks remain a Print / Save PDF acceptance check; the side preview is formatted HTML, not a newly generated PDF on every keystroke.
- Keep PR #1 draft pending release acceptance.
- Independent scrolling verified in staging: form scrolled 1280 px, workspace remained at scroll position zero and the preview stayed aligned with the visible workspace. Final side-by-side screenshot inspected. Test session signed out.
