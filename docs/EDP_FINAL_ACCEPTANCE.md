# EDP final acceptance — current at d671ade

PR #1 remains draft. Do not merge, deploy production, assign a real person, or issue genuine employee letters.

## Verified
- Super-admin-only ordinary administrator assignment, server authorization, protected super-admin/self targets, preserved permission flags, and atomic audit logging.
- Real staging HTTP grant/revoke and same-session access transitions; ordinary administrator cannot assign roles.
- Signed-in staging dashboard, Users-tab restrictions, HR Letters and review navigation.
- Real staging logout removes its server session without manual cleanup.
- Full staging database draft/submit/separate approval/issuance test passed with rollback, including self-approval denial and issued-record immutability.
- Full local suite passed at d671ade, including preview/review response races and confirmation/cancel logic.

## Remaining browser acceptance
The native confirmation dialog cannot currently be controlled by the in-app browser tool. Automated logic checks are not a substitute for observing the real dialog.

Use only the selected staging project fjesgcsumbuniatyaeee and disposable edp-test-{super,admin,user}@example.invalid accounts. They are currently disabled. A controlled run must temporarily enable only required test accounts, supply fresh credentials, provide a temporary dummy entity for the dummy employee, and restore cleanup afterward. Do not use a production browser session.

Record PASS/FAIL and evidence for each:
- [ ] As dummy super administrator, open Users and Grant Administrator for the dummy target. Confirm the displayed name/email and full administrator impact. Cancel: role and audit count must remain unchanged.
- [ ] Confirm grant: target becomes ordinary Administrator, exactly one grant audit event appears, existing app/HR flags remain unchanged, and no Super Administrator option exists.
- [ ] Confirm revoke: target returns to User, exactly one revoke audit appears, existing app/HR flags remain unchanged. Verify target access immediately reflects both changes.
- [ ] Protected super-admin and current-user rows cannot be changed. Ordinary administrator has no role-assignment controls.
- [ ] Using a dummy employee and explicitly marked test text, preview/save/submit; cancel approval once, then approve as a different dummy super administrator. Cancel issuance once, then issue only the dummy test letter. Verify frozen text and audit history. This does not send a letter.
- [ ] Repeat relevant controls at narrow/mobile width and by keyboard; verify readable confirmation, focus, cancellation and return focus.
- [ ] Sign out, verify test sessions removed, restore target non-admin, disable disposable accounts, and verify unrelated staging data unchanged. Retain clearly marked issued test evidence; do not bypass issued-record protection for cleanup.

## Confirmed salary definition — 2026-09-25
Irene confirmed in this task that Final Approved Salary always means monthly basic salary excluding allowances. The existing final_salary → current_basic mapping is retained. Local database tests verify the stored value is used, client overrides are ignored, and missing salary prevents submission. This confirms the field definition, not the accuracy of any individual employee amount.

## Release decision
Keep production unchanged until remaining browser acceptance is resolved. Irene must select a person before any real administrator assignment.


## Mobile/keyboard check — 2026-09-25

Actual Users-tab UI with local dummy-only RPC data passed 390×844 and 320×740 viewport checks: document width did not exceed viewport width (390/390 and 305/320 px respectively); both grant/revoke buttons remained within the horizontal viewport. At 390 px the screenshot confirmed readable cards and visible keyboard focus. Tab moves Users → Access Log → Grant Administrator; Shift+Tab returns from Grant to Access Log. No role action was confirmed and network requests were blocked by the fixture. Viewport reset and tab/server closed afterward. This verifies basic responsive layout and control reachability, not native-dialog focus/cancellation or complete modal focus containment; those remain open.


## Admin Control keyboard fix — 2026-09-25

Added dialog role/name, an accessible Close label, initial focus on Close, Tab/Shift+Tab wrapping among visible enabled controls, Escape closing and focus return. Actual dashboard-script keyboard tests and navigation regressions pass. This fixes previously absent focus containment; browser verification of the new behavior remains open, as does native confirmation-dialog acceptance. No production deployment.
