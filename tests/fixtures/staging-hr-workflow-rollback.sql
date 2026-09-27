-- STAGING ONLY: run against fjesgcsumbuniatyaeee. Entire test rolls back.
begin;
set local statement_timeout='30s';
create temporary table edp_before as select
 (select md5(string_agg(row_to_json(t)::text,'' order by code)) from public.hr_letter_templates t) templates,
 (select count(*) from public.hr_letter_records) letters,
 (select count(*) from public.hr_letter_audit) audits;
insert into public.jd_entities(code,name,is_active) values('MEG','EDP ROLLBACK TEST ENTITY',true);
update public.hr_letter_templates set body='TEST ONLY {{company_name}} / {{employee_name}}',version='rollback-test' where code='LOC';
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='edp-test-admin@example.invalid'),true);
set local role authenticated;
do $$ declare letter uuid; begin
 letter:=public.hr_letters_admin_save_draft('00000000-0000-4000-8000-00000000ed01','LOC','{}');
 perform set_config('edp.test_letter',letter::text,true);
 if public.hr_letters_admin_submit_draft(letter)<>'pending_approval' then raise exception 'Submit failed'; end if;
 begin perform public.hr_letters_admin_decide(letter,true,null); raise exception 'Ordinary admin approval unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin perform public.hr_letters_admin_issue(letter); raise exception 'Ordinary admin issuance unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='edp-test-super@example.invalid'),true);
set local role authenticated;
do $$ declare letter uuid:=current_setting('edp.test_letter')::uuid; own uuid; begin
 if public.hr_letters_admin_decide(letter,true,null)<>'approved' then raise exception 'Separate approval failed'; end if;
 if public.hr_letters_admin_issue(letter)<>'issued' then raise exception 'Issuance failed'; end if;
 if public.hr_letters_admin_view(letter)->>'text'<>'TEST ONLY EDP ROLLBACK TEST ENTITY / EDP Dummy Employee' then raise exception 'Frozen text mismatch'; end if;
 own:=public.hr_letters_admin_save_draft('00000000-0000-4000-8000-00000000ed01','LOC','{}');
 perform public.hr_letters_admin_submit_draft(own);
 begin perform public.hr_letters_admin_decide(own,true,null); raise exception 'Self approval unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare letter uuid:=current_setting('edp.test_letter')::uuid; begin
 if (select count(*) from public.hr_letter_audit where letter_id=letter)<>4 then raise exception 'Expected four audit events'; end if;
 begin update public.hr_letter_records set issued_snapshot='{}' where id=letter; raise exception 'Issued edit unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.hr_letter_records where id=letter; raise exception 'Issued delete unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select jsonb_build_object('letters',(select count(*) from public.hr_letter_records),'audits',(select count(*) from public.hr_letter_audit),'temporary_entity',(select count(*) from public.jd_entities where code='MEG'),'test_template',(select count(*) from public.hr_letter_templates where version='rollback-test'),'inactive_templates',(select count(*) from public.hr_letter_templates where not active),'all_dummy_disabled',(select bool_and(banned_until>now()) from auth.users where email in ('edp-test-admin@example.invalid','edp-test-super@example.invalid','edp-test-user@example.invalid'))) cleanup;
