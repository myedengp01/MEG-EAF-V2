# HR Letters live development

2026-09-30: publish tested HR Letters files from feature commit 88c5f0d without replacing newer dashboard/Handbook features. Existing gateway login and admin-only access are used. No user roles changed.

Production received the five company/salary/signed-copy/upload migrations plus live-development guard atomically as hr_letters_live_admin_development_bundle. Existing 15 template wording retained except reviewed salary changes. No employee records, real letters or roles created by deployment. Ordinary users denied; operational issuance disabled server-side. Separate super administrator still required for approval and reusable-template publication. Draft exports are marked DRAFT — NOT ISSUED.

Validation: full existing regression suite passes. Live rollback checks verified admin directory/template reads, ordinary-user denial, field parsing and issuance block. Browser/user acceptance of each template and uploaded document pagination remains in progress. PR #1 remains draft; this is a selective live development release, not the entire branch merge.
