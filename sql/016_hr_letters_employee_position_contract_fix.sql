-- Applied to Supabase vzngfswtofegimfcoigx on 2026-09-22.
-- 013 originally returned job_title; the UI expects position. Quote reserved identifier.
drop function public.hr_letters_admin_employees();
create function public.hr_letters_admin_employees()
returns table(id uuid,employee_id text,employee_name text,company_code text,department text,"position" text)
language plpgsql stable security definer set search_path=public,auth as $$
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 return query select e.id,e.employee_id,e.employee_name,e.company_code,e.department,e.approved_job_title from public.employee_master e order by e.employee_name,e.employee_id limit 2000;
end $$;
revoke all on function public.hr_letters_admin_employees() from public,anon;
grant execute on function public.hr_letters_admin_employees() to authenticated;
