# Fixed HR Letters action bar — 27 September 2026

## Done
- Save/Print/Share were disabled by preview state, not the ordinary administrator's role.
- Save Draft now accepts unfinished fields after employee/template selection. Server-side permissions and submission validation are unchanged.
- Print/Share require a complete current preview. Toolbar guidance explains the next step; field edits invalidate exports, busy operations disable them, and saving a draft retains a valid preview.
- Preview, Save Draft, Print / Save PDF and Share live in the top navigation area outside the scrollable form. The content pane scrolls independently; toolbar wraps on narrow screens and Hide actions remains available.
- Print CSS restores normal full-document flow, preventing the scrollable screen layout from clipping printed pages.

## Verification
- Full local suite passed, including revised actual-script preview race tests and saving current unfinished fields. No production or permission changes.

## To do
- Refresh staging and verify the top bar and draft/export workflow with the disposable administrator. Keep PR #1 draft; no production deployment.
- Real staging browser verified: content scrolled 1123 px while the action bar stayed at exactly the same viewport position. Save Draft enabled before preview; Print remained disabled with explanatory guidance. Verification session signed out.
