# EDP administrator assignment — 2026-09-22

Implemented on `feature/hr-letters-v2026-09-21-1430` for draft PR #1. **Not deployed. No real account roles changed.**

## Verified existing contract

Read-only inspection of Supabase project `vzngfswtofegimfcoigx` found:

- `eaf_v2_staff_permissions` is the V2 role authority. `is_admin` and `is_super_admin` are separate, non-null flags. Gateway and detailed HR flags are separate columns. Legacy `eaf_staff_profiles` and other applications' `form_permissions` are not updated by this feature.
- One administrator exists and is also the sole super administrator. No account was selected or assigned.
- `eaf_v2_gateway_staff_directory` already returns both role flags and account status. The gateway bootstrap combines the flags into `is_admin`, so the new UI checks the current user's directory entry for the actual super-admin flag.
- `eaf_v2_set_staff_permissions` previously allowed any ordinary administrator to change another user's `is_admin`. The new table trigger guards this older RPC too. Existing ordinary-permission updates and gateway access updates remain available under their current authorization.
- Permissions have SELECT-only RLS policies and no authenticated table UPDATE privilege; gateway audit entries have RLS with no direct client policies. Audit access is through the existing admin RPC. The isolated fixture deliberately grants broader table privileges to test RLS as an additional barrier.
- HR Letters permits ordinary administrators to prepare/submit drafts. Approval and issuance require a different super administrator. This feature preserves those rules; it does not grant approval authority to the new ordinary administrator.

## Change

The Users tab labels User, Administrator and protected Super Administrator. Only a super administrator sees Grant/Revoke Administrator buttons. The current user and all super administrators are protected. Pending/disabled users cannot be granted the role. Revocation remains possible for an existing ordinary administrator whose account is disabled.

Confirmation identifies the person's name/email and explains that ordinary administrator access is broad V2 access. Existing per-app and HR flags are retained on grant/revoke; their effective access is subject to the existing administrator overrides.

`public.eaf_v2_set_administrator(uuid,boolean,boolean)` accepts only target, desired ordinary role and expected current role. It delegates to an authorization-checked function in a dedicated unexposed schema, `eaf_v2_role_private`. It cannot set super-admin status. Anonymous/PUBLIC execution is revoked. The existing `private` schema grants are untouched.

The target row is locked and compared with the confirmed role before mutation. A table guard also prevents privileged inserts, identity reassignment, super-admin changes and deletion of privileged permission profiles. Revoke an ordinary administrator before deleting their profile; super-admin provisioning/removal requires a separately reviewed database maintenance path.

Every actual administrator change, including through the old RPC, writes actor, target, old/new role, action and timestamp into the existing gateway Access Log in the same transaction. Audit failure rolls back the role change; no-op requests do not create duplicate audit events.

## Validation

- 38 isolated PostgreSQL/PGlite checks passed using dummy users and schema/function definitions captured read-only from the project. Covered authenticated/anonymous denials, ordinary-admin bypass attempts through the old RPC, self/super-admin protection, invalid/inactive targets, grant/revoke, stale expected state, retained permission flags, missing-row initialization, RLS, audit content and audit-failure atomicity.
- The same isolated test exercised the existing HR Letters migrations with a dummy employee/template: newly granted administrator creates and submits; ordinary administrator cannot approve/issue; separate super administrator approves/issues; self-approval and mutation of an issued letter fail; revoked administrator loses draft access.
- UI checks passed for role visibility, escaped names, confirmation/cancellation, grant/revoke arguments, protected/inactive accounts, errors/refresh and tab guards.
- Local browser DOM and screenshot verified the Users-tab layout with dummy rows. Native confirmation interaction hit a browser-control timeout; confirmation logic is covered by the automated UI test. Production sign-in and production mutation were not tested.
- JavaScript syntax and Git whitespace checks passed.
- On 2026-09-23, real password sign-in and PostgREST authorization/grant/revoke/audit/cleanup checks passed in the separately authorized staging project `fjesgcsumbuniatyaeee`. Staging uncovered a retry-loop defect in `40001`; the pending migration now uses `PT409` for an expected-role conflict. Existing staging JD data and the unrelated Auth account were verified unchanged. See [staging evidence](EDP_STAGING_CHECK.md) for scope and remaining browser/full-app checks.

### Supabase rollback integration check

On 2026-09-22, the migration was tested inside a single rolled-back transaction against `vzngfswtofegimfcoigx`. There was no persistent deployment. No existing staging branch was available. Account-creation/profile triggers were inspected first: the dummy inserts create database profile rows, without outbound email or notification calls. Only three reserved test UUIDs with `example.invalid` addresses were inserted; their initial roles were bootstrapped before installing the guard inside the same transaction.

The test used actual `authenticated` and `anon` database roles and request user IDs. It verified user and ordinary-admin denial, denial through the legacy staff RPC, direct-table-write denial, self/super-admin protection, grant/revoke, stale-state rejection, preservation of ordinary permissions, continued ordinary permission-management RPCs, and both audit events through `eaf_v2_gateway_get_access_log`. A snapshot comparison confirmed that every pre-existing permission row remained unchanged before rollback.

The first run stopped because production denies UPDATE at the table privilege layer, which is stricter than the isolated fixture's RLS-only denial. Rollback was confirmed, and the test was corrected to accept either legitimate denial mechanism. The complete second run passed and returned:

```json
{"result":"Rollback completed; all preceding assertions passed","migration_absent":true,"dummy_users_absent":true,"dummy_permissions_absent":true,"dummy_audits_absent":true}
```

`node tests/build-admin-role-rollback.mjs` emits the reproducible rollback-only SQL batch; it does not connect to a database. Review project triggers before running it elsewhere. The batch uses a 2-second lock timeout and a 15-second statement timeout and refuses to run if the migration or dummy IDs already exist. PostgreSQL audit sequence allocations can leave harmless ID gaps after rollback. This validates the actual database schema and RPC execution, but not a signed-in browser/PostgREST request across the network.

Run reproducible tests with `npm ci --prefix tests` then `npm test --prefix tests` (Node.js required). PGlite is pinned to 0.3.14. Auth/profile tables in the fixture are minimal test doubles; this does not replace a staging Supabase/PostgREST integration check.

## Release hold

Keep PR #1 a draft. The new migration is `supabase/migrations/20260922115958_eaf_v2_admin_role_assignment.sql`, generated by the Supabase CLI and **not applied to production**. It depends on the existing V2 gateway/permissions schema. Do not blindly push all historical migrations: the repository also contains previously applied numbered SQL files.

The role migration and authenticated RPC have passed the isolated staging check, including Access Log and super-admin protection. Complete full-app browser acceptance and remaining HR Letters release checks before lifting the hold; when authorized, deploy database before UI. Irene must select the actual person before any real role assignment.

Existing HR Letters release blockers in PR #1 (navigation, legal entity/salary mapping, template reproducibility and production verification) remain. The draft preview race is fixed with local delayed-response regression coverage; full-app browser acceptance remains open. The isolated workflow test does not resolve those separate issues.

The live security advisor was read as a baseline, not as a post-deployment check. It reports existing unrelated definer views, mutable function search paths and broadly executable legacy functions. This change uses explicit search paths and restricted execution. See [Supabase's advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view). RLS-without-policy notices on RPC-only audit/letter tables are expected fail-closed behavior.
