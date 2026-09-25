-- Staging-only navigation prerequisites captured read-only from production 2026-09-25.
-- No production records copied. Only HR Letters is registered in this fixture.
begin;
set local lock_timeout='2s';
do $$ begin
 if to_regclass('public.eaf_v2_gateway_apps') is not null or to_regprocedure('public.eaf_v2_gateway_my_access()') is not null or to_regprocedure('public.eaf_v2_gateway_can_access(text,uuid)') is not null or to_regprocedure('public.eaf_v2_gateway_log_login()') is not null or to_regprocedure('public.eaf_v2_gateway_log_app_open(text)') is not null then raise exception 'Refuse to overwrite gateway objects'; end if;
end $$;
create table public.eaf_v2_gateway_apps(app_code text primary key,app_name text not null,app_path text not null,mode text not null default 'restricted' check(mode in ('restricted','admin_only','disabled')),sort_order integer not null default 100,updated_at timestamptz not null default now(),updated_by uuid);
alter table public.eaf_v2_gateway_apps enable row level security;
revoke all on public.eaf_v2_gateway_apps from public,anon,authenticated;
insert into public.eaf_v2_gateway_apps(app_code,app_name,app_path,mode,sort_order) values('hr_letters','HR Letters','hr-letters.html','admin_only',50);
CREATE OR REPLACE FUNCTION public.eaf_v2_gateway_can_access(p_app_code text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_mode text;
  v_perm boolean := false;
  v_admin boolean := false;
begin
  if auth.uid() is null or p_user_id is null or p_user_id <> auth.uid() then
    return false;
  end if;

  select coalesce(v.is_admin,false) or coalesce(v.is_super_admin,false)
    into v_admin
  from public.eaf_v2_staff_permissions v
  where v.user_id=p_user_id;

  if coalesce(v_admin,false) then return true; end if;

  select a.mode into v_mode
  from public.eaf_v2_gateway_apps a
  where a.app_code=p_app_code;

  if not found or v_mode in ('admin_only','disabled') then return false; end if;

  select case p_app_code
    when 'apply' then coalesce(v.can_access_apply,false)
    when 'hr' then coalesce(v.can_access_hr,false)
    when 'jd_manual' then coalesce(v.can_access_jd_manual,false)
    when 'hr_law' then coalesce(v.can_access_hr_law,false)
    else false
  end
  into v_perm
  from public.eaf_v2_staff_permissions v
  where v.user_id=p_user_id;

  return coalesce(v_perm,false);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.eaf_v2_gateway_log_app_open(p_app_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if auth.uid() is null then return false; end if;
  if not public.eaf_v2_gateway_can_access(p_app_code,auth.uid()) then return false; end if;
  insert into public.eaf_v2_gateway_access_log(user_id,event_code,app_code)
  values(auth.uid(),'app_open',p_app_code);
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.eaf_v2_gateway_log_login()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if auth.uid() is null then return false; end if;
  insert into public.eaf_v2_gateway_access_log(user_id,event_code) values(auth.uid(),'login');
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.eaf_v2_gateway_my_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text := '';
  v_email text := '';
  v_admin boolean := false;
  v_apps jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select coalesce(s.full_name,''), coalesce(u.email,'')
    into v_name,v_email
  from auth.users u
  left join public.eaf_staff_profiles s on s.id=u.id
  where u.id=v_uid;

  select coalesce(v.is_admin,false) or coalesce(v.is_super_admin,false)
    into v_admin
  from public.eaf_v2_staff_permissions v
  where v.user_id=v_uid;

  select coalesce(jsonb_object_agg(
    a.app_code,
    jsonb_build_object(
      'name',a.app_name,
      'path',a.app_path,
      'mode',a.mode,
      'allowed',public.eaf_v2_gateway_can_access(a.app_code,v_uid)
    ) order by a.sort_order
  ),'{}'::jsonb)
  into v_apps
  from public.eaf_v2_gateway_apps a;

  return jsonb_build_object(
    'user',jsonb_build_object(
      'id',v_uid,
      'full_name',coalesce(nullif(v_name,''),v_email),
      'email',v_email,
      'is_admin',coalesce(v_admin,false)
    ),
    'apps',v_apps
  );
end;
$function$
;
revoke all on function public.eaf_v2_gateway_can_access(text,uuid) from public,anon;
grant execute on function public.eaf_v2_gateway_can_access(text,uuid) to authenticated;
revoke all on function public.eaf_v2_gateway_my_access() from public,anon;
grant execute on function public.eaf_v2_gateway_my_access() to authenticated;
revoke all on function public.eaf_v2_gateway_log_login() from public,anon;
grant execute on function public.eaf_v2_gateway_log_login() to authenticated;
revoke all on function public.eaf_v2_gateway_log_app_open(text) from public,anon;
grant execute on function public.eaf_v2_gateway_log_app_open(text) to authenticated;
commit;

