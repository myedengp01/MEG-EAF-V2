# EDP uploaded letters and TP alternatives

Implemented on 28 September 2026 for draft PR #1. Database migration applied only to disposable staging `fjesgcsumbuniatyaeee`. No production migration, merge, deployment or actual-user role assignment.

## Behavior

- Digital letter selector includes permitted alternatives such as `LOC TP2 — Letter of Confirmation`; selecting one opens the uploaded-letter workspace.
- Word `.docx` and flattened PDF uploads up to 10 MB. Original bytes remain in private `hr-letter-sources` storage. PDFs have a 30-page preview limit.
- `{{field_name}}` placeholders in Word become employee values or editable fields. Supports tags split across Word formatting runs. No expressions, loops or executable placeholders. Missing values show bracketed light-red highlights; explicit incomplete preview asks whether to continue.
- Documents without placeholders retain their wording. PDFs do not perform text replacement or OCR. Legacy `.doc`, macro files, Word embedded objects/HTML and external relationships are refused.
- Choose the employing company and keep an included letterhead (or original blank space), or add the selected company's supplied letterhead. Company mismatches are rejected on the server. Word content flows below the added image; PDF content is fitted below it without covering original content.
- Live read-only preview and fixed toolbar provide Preview, Save Draft, Print / Save PDF, Share and navigation. Incomplete drafts can save but cannot export or submit.
- Word uses browser print-to-PDF and text sharing. PDF saves a generated PDF and shares that file where supported, otherwise downloads it for attachment. No automatic message delivery.
- Uploads can be private or requested as reusable templates. Server assigns TP2/TP3 under a lock on the base template. A different super administrator must publish reusable alternatives. The base digital template is unchanged.
- Letter approval/issuance still requires a different super administrator. Submitted source path, values, wording and letterhead mode are frozen and copied into the issued snapshot. The review screen renders the uploaded source with that frozen data before showing decision controls.
- Issued letters retain the existing signed-copy upload and employee-document registration workflow.

## Controls and validation

New tables have RLS enabled and no direct API grants. RPCs check authenticated administrator status. Publication checks super-admin status and disallows self-publication. Upload registration checks the caller-owned source object, company, MIME type and size; uploaded versions cannot be edited in place. Storage update/delete is denied to authenticated clients, including through other permissive policies. Template upload/publication and letter workflow actions are audited.

The administrator supplies the Word wording and field manifest; this is an authoring input, not trusted evidence that the letter is correct. Independent review must inspect the rendered document, including original text that contains no placeholders. No template publication automatically approves an employee letter.

Automated tests cover Word split-run replacement, XML escaping, formatting preservation, missing fields, macro/external-link refusal, PDF form refusal, role and ownership checks, private/published visibility, TP2/TP3 numbering, self-publication denial, company checks, authoritative salary, immutable versions/storage and frozen data through issuance. Existing regression suite also passes.

Staging API tests uploaded dummy Word/PDF files, confirmed byte-for-byte original downloads, denied ordinary-user downloads, published the dummy Word alternative through the separate super account and submitted its draft. Test fixtures: `LOC_TP2`, `LOC_TP3`; pending dummy letter `ca791366-d154-41b5-a6ba-8d092ca0177e`. No real employee data used.

Browser checks confirmed incomplete Word highlighting, populated Word preview, company letterhead placement, complete-state buttons, built-in PDF canvas preview and the separate reviewer viewing the frozen uploaded document with approval controls. Word browser pagination is not guaranteed identical to Microsoft Word; final print layout should be checked with Irene's representative documents.

Supabase advisor findings were reviewed: RPC-only tables intentionally have no direct policies; privileged RPC warnings are covered by explicit role checks and negative tests. Staging's pre-existing leaked-password protection warning remains outside this change. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Acceptance remaining

Irene should test representative company Word/PDF letters, including multi-page documents and final print margins, before production release. Native platform sharing and physical printing require her device/recipient choices. No external sharing was performed during testing.

Rebuild local staging copies with the staging publishable key using `tests/build-staging-ui.mjs`, then run `node tests/serve-staging-ui.mjs`. The server binds only to `127.0.0.1:8767` and allows connections only to the staging project and local document assets.
