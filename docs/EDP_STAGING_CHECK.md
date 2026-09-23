# EDP signed-in staging verification

**Status: real staging authentication and HTTP role tests passed on 2026-09-23 (Asia/Kuala_Lumpur).** After staging setup was authorized, the isolated EAF fixture was applied to `MEG-EAF-V2-STAGING` (`fjesgcsumbuniatyaeee`) and three disposable `example.invalid` Auth accounts were created without invitations. Production remains unchanged. Before/after row counts and digests match for all eight existing JD Manual tables and the unrelated existing Auth account. The full HR Letters app is not deployed to staging; its separate release checks remain open.

## Prepared staging setup

`tests/fixtures/staging-admin-role-bootstrap.sql` is an atomic setup package for the separate staging project, applied as `edp_staging_admin_role_test_setup`. It creates three EAF tables and the permission/directory/Access Log RPCs needed by the HTTP test, installs the reviewed administrator-role guard and audit migration, and seeds permission rows only for the three explicitly named disposable test accounts. It copies schema/function definitions, not production user or employee records. Existing JD Manual tables and existing unrelated Auth accounts are untouched.

The package refuses to overwrite an existing EAF schema and requires the three active dummy Auth accounts to exist before it runs. It does not create those Auth accounts, change their passwords, send invitations, or bootstrap a full dashboard/HR Letters app. It is a test fixture, not a general production migration. Apply only to `fjesgcsumbuniatyaeee` after staging setup is authorized; never apply to production.

`node tests/staging-bootstrap.test.mjs` passes locally: missing dummy accounts are refused; only dummy permission rows are seeded; existing JD data and unrelated Auth users are preserved; directory, grant/revoke and audit reads work; anonymous access and overwrite attempts are refused. The production no-deploy hold remains in place.

## Recorded HTTP result

The three accounts signed in through the real password authentication endpoint. The real PostgREST run passed anonymous/user/ordinary-admin denials, legacy-RPC denial, super-admin self-protection, grant/revoke, unchanged app flags, stale-state rejection, newly persisted grant/revoke audit events, and verified restoration of the dummy target to non-admin. API sessions were signed out. No real user roles were assigned.

The first staging run exposed an integration defect: SQLSTATE `40001` caused repeated retries and a timeout in this PostgREST version. Cleanup restored the dummy target. The expected-role conflict now raises `PT409` (HTTP 409), applied to staging as `edp_staging_role_conflict_http_409`; the complete rerun passed. The pending production migration, bootstrap fixture, rollback generator and test expectations all use the corrected code. See [Supabase's retry guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

The staging security advisor returned no error-level findings. RPC-only tables have RLS-without-policy informational notices; authenticated definer RPCs remain authorization-gated. The existing leaked-password-protection setting was not changed.

After verification, all dummy API/browser sessions were signed out, the three disposable Auth accounts were disabled (`banned_until = infinity`), and the local temporary password file was removed. The target remains non-admin; test role rows and audit evidence are retained in staging. A later run requires explicitly re-enabling only these disposable accounts and supplying fresh test credentials. Do not enable or modify the unrelated existing account.

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

Signed-in browser smoke checks passed using the actual `dashboard.html` sign-in and `admin-roles.js` against staging. A local-only adapter supplied the missing gateway bootstrap from authenticated user/admin RPCs; it did not replace the role directory or assignment RPC. Super administrator saw Grant/Revoke and a protected Super Administrator label; ordinary administrator saw no assignment buttons and retained app-access checkboxes; normal user saw no Admin Control. Each account signed out. This verifies the role-specific rendering, not a complete deployed gateway/HR Letters app. Native confirmation, mobile/keyboard acceptance, and full-app grant-to-access/revoke-to-denial still require acceptance in that environment; automated UI tests cover confirmation/cancel and real HTTP tests cover mutation/audit.

Once a non-production app URL is selected, sign in through that app with each dummy account. Use its Admin Control → Users tab:

- Super administrator: protected Super Administrator label; Grant/Revoke controls only for eligible other users. Confirm names/email, cancel once and verify no role change; grant and revoke the dummy target and verify status plus Access Log.
- Ordinary administrator: no role-management buttons. Existing app-permission controls still work as before.
- Normal user: no Admin Control access. After temporary grant, refresh/sign in again and verify administrator entry; after revoke, reload and verify access is removed.
- Confirm no Super Administrator assignment option exists. Check narrow/mobile layout, keyboard focus and confirmation cancellation.

Record the staging project/app URL, commit, test time, HTTP result and browser observations without credentials. Keep PR #1 in draft until the remaining HR Letters release checks also pass. Irene must select a person before any real role assignment.
