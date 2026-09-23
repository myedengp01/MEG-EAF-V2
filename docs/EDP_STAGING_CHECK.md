# EDP signed-in staging verification

**Status: prepared, not run against a staging service.** Account-wide discovery found the separate project `MEG-EAF-V2-STAGING` (`fjesgcsumbuniatyaeee`). Earlier discovery checked only branches under production and therefore missed it. Read-only inspection found eight JD Manual tables and one existing Auth account, with no EAF permission/gateway tables or RPCs. No staging changes have been applied. The actual-schema rollback test passed, but does not test a browser or PostgREST authentication over HTTP. Do not merge or deploy production based solely on the local or rollback tests.

## Prepared staging setup

`tests/fixtures/staging-admin-role-bootstrap.sql` is a review-only, atomic setup package for the separate staging project. It creates three EAF tables and the permission/directory/Access Log RPCs needed by the HTTP test, installs the reviewed administrator-role guard and audit migration, and seeds permission rows only for the three explicitly named disposable test accounts. It copies schema/function definitions, not production user or employee records. Existing JD Manual tables and existing unrelated Auth accounts are untouched.

The package refuses to overwrite an existing EAF schema and requires the three active dummy Auth accounts to exist before it runs. It does not create those Auth accounts, change their passwords, send invitations, or bootstrap a full dashboard/HR Letters app. It is a test fixture, not a general production migration. Apply only to `fjesgcsumbuniatyaeee` after staging setup is authorized; never apply to production.

`node tests/staging-bootstrap.test.mjs` passes locally: missing dummy accounts are refused; only dummy permission rows are seeded; existing JD data and unrelated Auth users are preserved; directory, grant/revoke and audit reads work; anonymous access and overwrite attempts are refused. Staging account creation and applying this package remain pending under the no-deploy hold.

## Required staging environment

Use a separate, explicitly selected Supabase project with the existing gateway schema and the reviewed EDP migration. Never use production project `vzngfswtofegimfcoigx`. Test only disposable accounts; do not copy real personnel data into staging. Provisioning a staging project, applying migrations and creating accounts are separate setup actions, not performed by this test.

Prepare three distinct, active, email-confirmed dummy users with email addresses matching `edp-test-<name>@example.invalid`: one super administrator, one ordinary administrator, and one user with no administrator role. Use the approved staging account-provisioning path, not real email invitations. The target must start with Administrator disabled. Reserve these accounts exclusively for the run.

Set these values locally in the test process environment, not in chat, a committed file, or a command-line argument:

| Variable | Value |
| --- | --- |
| `EDP_STAGING_URL` | Separate project's HTTPS Supabase URL |
| `EDP_STAGING_KEY` | Its `sb_publishable_…` key; secret/service-role keys are refused |
| `EDP_SUPER_TOKEN` | Fresh access token for the dummy super administrator |
| `EDP_ADMIN_TOKEN` | Fresh access token for the dummy ordinary administrator |
| `EDP_USER_TOKEN` | Fresh access token for the dummy target user |

Obtain test sessions through the staging authentication flow. The script does not collect passwords, create sessions or bypass authentication. Do not extract production browser sessions.

## HTTP verification

Run `npm run test:staging --prefix tests`. The script:

1. Rejects production, non-HTTPS/unexpected hosts, URL credentials, missing configuration and secret keys.
2. Verifies all three tokens with `/auth/v1/user` and checks their actual directory roles and dummy identities before role tests.
3. Checks anonymous, regular-user, ordinary-administrator and legacy-RPC denial, plus protected super-admin behavior.
4. Grants the dummy target Administrator, re-reads the stored role/app flags, rejects stale confirmation, revokes the role, and confirms new grant/revoke Access Log events.
5. In a `finally` block, re-reads the target and revokes any leftover administrator role, including after a network timeout or an unexpectedly successful negative authorization test. Reports a prominent cleanup failure if restoration cannot be verified.

This script makes committed changes **only to the dedicated staging dummy target** and retains staging audit events. It cannot offer a cross-request SQL rollback. It does not change super-admin status, delete users or delete audit records. If cleanup fails, inspect and restore the dummy target before retrying. Tokens and response bodies are not printed.

The harness itself is covered by `npm test --prefix tests`, using a fake HTTP server implementation to exercise happy-path behavior, endpoint/account guards, missing migrations, timeout-after-commit cleanup, legacy authorization regression cleanup and cleanup failure. Those tests validate the harness, not the staging deployment.

## Browser acceptance

Once a non-production app URL is selected, sign in through that app with each dummy account. Use its Admin Control → Users tab:

- Super administrator: protected Super Administrator label; Grant/Revoke controls only for eligible other users. Confirm names/email, cancel once and verify no role change; grant and revoke the dummy target and verify status plus Access Log.
- Ordinary administrator: no role-management buttons. Existing app-permission controls still work as before.
- Normal user: no Admin Control access. After temporary grant, refresh/sign in again and verify administrator entry; after revoke, reload and verify access is removed.
- Confirm no Super Administrator assignment option exists. Check narrow/mobile layout, keyboard focus and confirmation cancellation.

Record the staging project/app URL, commit, test time, HTTP result and browser observations without credentials. Keep PR #1 in draft until the remaining HR Letters release checks also pass. Irene must select a person before any real role assignment.
