# Company letterheads and print layout — 26 September 2026

## Done
- Uses Irene's four supplied 11 August 2026 company letterhead JPGs for MEG, HD, ABP and MEH. Full artwork retained with its original aspect ratio; 2400-pixel-wide high-quality display copies provide over 300 pixels/inch at the 182 mm print width. Original OneDrive files unchanged.
- A4 print margins: top 8 mm, left/right/bottom 14 mm. Removed the previous stacked body/sheet padding and reconstructed logo/contact block.
- Bold letter title and section/subject headings; 11 pt Times New Roman body with 1.35 line height, paragraph spacing and justified prose.
- Pipe-delimited salary/promotion data rendered as a bordered table with bold column headers. Wording is inserted as text, never HTML.
- Employee signature gains three line heights of space; Name, NRIC and Date each gain one line. Compact acknowledgement lines in other templates receive the same structured fields.
- Authorised signatory gains blank Name and Designation lines. Signature sections avoid internal page breaks; longer letters may use two pages to retain readable text and signing space.
- Shared renderer and print stylesheet used by both draft and issued-letter screens. Existing saved/frozen letter text, role permissions and database records unchanged.

## Verification
- Full existing test suite passed after integration. New renderer test covers all 15 template bodies, all four company mappings, salary tables, signature fields and literal handling of HTML-like input.
- Browser visual inspection of the dummy confirmation/increment letter verified supplied letterhead, bold title, justified paragraphs, table and expanded signing blocks. DOM measurements verified 8 mm header offset, 182 mm content width and three-line signature padding.
- Staging copies updated. Actual printer/PDF driver output remains a user acceptance check; native print dialogs and printer-specific settings were not automated.

## To do
- Refresh staging, generate a fresh preview, then Print / Save PDF on A4. Use 100% scale and disable browser-generated headers/footers if those are enabled.
- Review spacing in the saved PDF. Do not merge/deploy production until acceptance and existing release checks are complete.
