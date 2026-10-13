# Address fields and reusable resignation alternative

The Admin Centre now shows a collapsible quick reference for data placeholders and bold, italic and underline markers. Use + New placeholder in the template editor, insert its {{key}} into the wording, and save the template with a reason. Reopening the template generates the corresponding entry field. A registry entry alone does not add wording or a field to every letter.

All 15 existing native templates have a versioned date and recipient address block. Submitted and issued snapshots are unchanged. Address line 1 is required; line 2, postcode/town and state are optional. Saved correspondence address is used first, then residential address. Existing addresses are free text and remain together in line 1; they are not guessed into separate components. Editing address fields applies only to that letter. Use saved employee address restores the saved source. No employee master or personal-detail records are modified by this release.

RL TP2 is a native, company-neutral alternative based on the supplied resignation reference. It uses the employee's legal-company letterhead. The original RL remains available. Sample names, address, employer, dates and leave amounts were removed. Inconsistent placeholder spellings were normalized. Last notice date means employment end; last working day means the final physical working day. Leave entitlements and balances remain manually reviewed inputs, not an automated leave calculator.

Native TP alternatives open in the digital editor; Word/PDF alternatives still open in the upload workspace. Number allocation considers both kinds so future RL uploads do not collide with RL TP2.

Verification: node tests/hr-letter-address.mjs and node tests/hr-letter-address-ui.mjs, plus existing formatting and print regressions. Isolated database coverage includes all 15 address layouts, four entities, address fallback and overrides, unchanged source data, frozen submissions, TP numbering and non-admin denial. Browser testing uses an isolated dummy database. Live release remains admin testing only with operational issuance disabled.
