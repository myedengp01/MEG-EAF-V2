-- Applied to production with migration hr_letters_admin_readonly_gateway_20260921.
-- Admin-only registration is deliberately not sufficient to activate issuance.
insert into public.eaf_v2_gateway_apps(app_code,app_name,app_path,mode,sort_order)
values ('hr_letters','HR Letters','hr-letters.html','admin_only',50)
on conflict(app_code) do update set app_name=excluded.app_name,app_path=excluded.app_path,mode='admin_only';

create or replace function public.hr_letters_admin_templates()
returns table(code text,title text,version text,active boolean,has_body boolean)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then
   raise exception 'HR Letters administrator access required' using errcode='42501';
 end if;
 return query select t.code,t.title,t.version,t.active,(length(btrim(t.body))>0)
 from public.hr_letter_templates t order by t.code;
end $$;
revoke all on function public.hr_letters_admin_templates() from public,anon;
grant execute on function public.hr_letters_admin_templates() to authenticated;
