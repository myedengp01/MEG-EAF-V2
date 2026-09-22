-- HR Letters V1 release preflight. Read-only: no employee, letter, audit, or permission mutations.
DO $$
DECLARE missing text;
BEGIN
 SELECT string_agg(name, ', ') INTO missing FROM (VALUES
 ('hr_letters_admin_templates'),('hr_letters_admin_employees'),('hr_letters_admin_template_fields'),
 ('hr_letters_admin_preview'),('hr_letters_admin_save_draft'),('hr_letters_admin_list_drafts'),
 ('hr_letters_admin_submit_draft'),('hr_letters_admin_decide'),('hr_letters_admin_issue'),
 ('hr_letters_admin_view'),('hr_letters_protect_issued'),('eaf_v2_gateway_my_access')
 ) required(name) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=required.name);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing HR Letters functions: %',missing; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.hr_letter_records'::regclass AND tgname='hr_letters_issued_immutable' AND NOT tgisinternal AND tgenabled<>'D') THEN RAISE EXCEPTION 'Issued-letter immutability trigger missing or disabled'; END IF;
 IF (SELECT count(*) FROM public.hr_letter_templates WHERE length(btrim(coalesce(body,'')))>0)<>15 THEN RAISE EXCEPTION 'Expected 15 populated HR letter templates'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE n.nspname='public' AND p.proname IN ('hr_letters_admin_decide','hr_letters_admin_issue','hr_letters_admin_view') AND acl.privilege_type='EXECUTE' AND (acl.grantee=0 OR acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))) THEN RAISE EXCEPTION 'Sensitive HR Letters RPC exposed to anon/PUBLIC'; END IF;
 IF EXISTS(SELECT 1 FROM public.hr_letter_records WHERE status='issued' AND (issued_snapshot IS NULL OR issued_snapshot->>'letter_text' IS NULL)) THEN RAISE EXCEPTION 'Issued letter without frozen text'; END IF;
 RAISE NOTICE 'PASS: RPC presence, immutability trigger, templates, RPC privileges and issued snapshot checks';
END $$;
-- Informational: do not silently create accounts or delete records to satisfy these checks.
SELECT count(*) AS admin_count, count(*) FILTER(WHERE is_super_admin) AS super_admin_count, count(*) FILTER(WHERE is_admin AND NOT is_super_admin) AS separate_admin_count FROM public.eaf_v2_staff_permissions WHERE is_admin OR is_super_admin;
SELECT status,count(*) AS letters FROM public.hr_letter_records GROUP BY status ORDER BY status;
SELECT count(*) AS audit_events FROM public.hr_letter_audit;
