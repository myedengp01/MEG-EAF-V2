# HR Letters Admin Centre

Open Admin Centre from the fixed top banner of the digital, upload or review workspace. Existing administrator access is required on the page and every management RPC. This release does not grant roles or enable operational issuance.

## Placeholder library
The initial registry contains the 112 distinct tags in the 15 current templates. Search by key, label, description or template. Copy {{key}} into digital wording or a Word document. Add the definition before uploading a file that uses a new key. Unknown or archived tags are rejected.

Sources: manual entry; saved default (editable or locked); approved Employee Master/company mapping; approved salary calculation (revised basic or increment percentage). Adding a key does not create new employee database columns. Employee mappings are restricted to name, ID, company name, department, position, current position, current department and current basic. Protected built-in mappings cannot be changed or archived. Manual fields remain editable. Dates are entered as text; money and percentage values are validated and rounded to two decimals. Missing optional fields render blank. Required missing fields remain visible in draft previews and prevent submission.

## Corrections and formatting
Digital template corrections require a reason, create an immutable history entry and check the expected version. Load an earlier version into the editor, review, then save a new version to restore its wording. Changes apply to future previews and unsubmitted drafts; submitted/issued text stays frozen. Uploaded Word/PDF sources remain immutable: upload a revised TP alternative. PDFs remain fixed documents, without text substitution.

Use [b]bold[/b], [i]italic[/i], [u]underline[/u], including nested styles and {{field}} inside them. Buttons insert these tags. Triple braces are rejected to avoid ambiguous data tags. Text is rendered through safe DOM/XML nodes; raw HTML is not executed. Existing Word run styles are preserved.

Edit a draft changes only an unsubmitted letter. It checks the last update time, logs the before/after values, and makes the editor the preparer so that they cannot approve their own correction. Submitted/approved/issued records cannot be edited here. Word/PDF draft fields can be corrected, but original wording requires reupload. Preview original uploaded layouts in the upload workspace.

## Verification
Run from tests after installing its existing dependencies: node hr-letters-admin-centre.mjs; node hr-letter-formatting.mjs; node hr-letter-print.mjs; node hr-letter-upload.mjs. Isolated database tests cover authorization, protected sources, defaults/calculations, optional values, unknown tags, format validation, optimistic conflicts, version history, draft ownership and frozen submissions. Live migration verification used transaction rollback: zero test fields and zero retained edit events. Browser interactions were tested with dummy responses, not a real employee session.
