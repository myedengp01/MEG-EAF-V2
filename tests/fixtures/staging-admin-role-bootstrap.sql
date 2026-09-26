-- EDP HTTP-test prerequisites for MEG-EAF-V2-STAGING (fjesgcsumbuniatyaeee).
-- Never apply to production. No production rows or JD Manual objects are copied/changed.
-- Requires pre-created active dummy Auth accounts edp-test-{super,admin,user}@example.invalid.
-- This is a test fixture, not a production migration or full app bootstrap.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local search_path=public,auth;
do $$ begin
 if to_regclass('public.eaf_staff_profiles') is not null or to_regclass('public.eaf_v2_staff_permissions') is not null or to_regclass('public.eaf_v2_gateway_access_log') is not null then
  raise exception 'Refuse: EAF tables already exist; this fixture must not overwrite an environment';
 end if;
 if (select count(*) from auth.users where email in ('edp-test-super@example.invalid','edp-test-admin@example.invalid','edp-test-user@example.invalid') and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))<>3 then
  raise exception 'Three dedicated active dummy Auth accounts required';
 end if;
end $$;
create table public.eaf_staff_profiles (
 id uuid not null,
 full_name text not null,
 is_admin boolean default false not null,
 can_view_applications boolean default false not null,
 can_edit_office_use boolean default false not null,
 can_change_status boolean default false not null,
 can_delete boolean default false not null,
 can_generate_letter boolean default false not null,
 created_at timestamp with time zone default now() not null,
 is_super_admin boolean default false not null,
 can_view_summary boolean default false not null,
 can_load_json_files boolean default false not null,
 can_import_edit_drafts boolean default false not null,
 can_submit_drafts boolean default false not null,
 can_view_payroll boolean default false not null,
 can_view_only boolean default false not null,
 constraint eaf_staff_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
 constraint eaf_staff_profiles_pkey PRIMARY KEY (id)
);
alter table public.eaf_staff_profiles enable row level security;
revoke all on public.eaf_staff_profiles from public,anon,authenticated;
create table public.eaf_v2_staff_permissions (
 user_id uuid not null,
 is_admin boolean default false not null,
 is_super_admin boolean default false not null,
 can_view_applications boolean default false not null,
 can_view_only boolean default false not null,
 can_edit_office_use boolean default false not null,
 can_generate_letter boolean default false not null,
 can_change_status boolean default false not null,
 can_delete boolean default false not null,
 can_view_summary boolean default false not null,
 can_load_json_files boolean default false not null,
 can_import_edit_drafts boolean default false not null,
 can_submit_drafts boolean default false not null,
 created_at timestamp with time zone default now() not null,
 updated_at timestamp with time zone default now() not null,
 updated_by uuid,
 can_access_apply boolean default false not null,
 can_access_hr boolean default false not null,
 can_access_jd_manual boolean default false not null,
 can_access_hr_law boolean default false not null,
 constraint eaf_v2_staff_permissions_pkey PRIMARY KEY (user_id),
 constraint eaf_v2_staff_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES eaf_staff_profiles(id) ON DELETE CASCADE
);
alter table public.eaf_v2_staff_permissions enable row level security;
revoke all on public.eaf_v2_staff_permissions from public,anon,authenticated;
create table public.eaf_v2_gateway_access_log (
 id bigint generated always as identity not null,
 user_id uuid,
 event_code text not null,
 app_code text,
 details jsonb default '{}'::jsonb not null,
 created_at timestamp with time zone default now() not null,
 constraint eaf_v2_gateway_access_log_pkey PRIMARY KEY (id)
);
alter table public.eaf_v2_gateway_access_log enable row level security;
revoke all on public.eaf_v2_gateway_access_log from public,anon,authenticated;
CREATE FUNCTION public.eaf_v2_gateway_get_access_log(p_limit integer DEFAULT 100)
 RETURNS TABLE(created_at timestamp with time zone, full_name text, email text, event_code text, app_code text, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.eaf_v2_is_admin(auth.uid()) then
    raise exception 'V2 Administrator access required' using errcode='42501';
  end if;
  return query
  select l.created_at,
         coalesce(nullif(s.full_name,''),u.email,'')::text,
         coalesce(u.email,'')::text,
         l.event_code,l.app_code,l.details
  from public.eaf_v2_gateway_access_log l
  left join auth.users u on u.id=l.user_id
  left join public.eaf_staff_profiles s on s.id=l.user_id
  order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$function$
;
CREATE FUNCTION public.eaf_v2_gateway_set_user_access(p_user_id uuid, p_app_code text, p_allowed boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.eaf_v2_is_admin(auth.uid()) then
    raise exception 'V2 Administrator access required' using errcode='42501';
  end if;
  if p_user_id is null or p_app_code not in ('apply','hr','jd_manual','hr_law') then
    raise exception 'Valid user and app code are required';
  end if;
  -- Build 10 normally seeds this row when eaf_staff_profiles is created. This
  -- defensive insert also handles any older account whose V2 row was missed.
  insert into public.eaf_v2_staff_permissions(user_id)
  select p.id from public.eaf_staff_profiles p where p.id=p_user_id
  on conflict (user_id) do nothing;

  if not exists(select 1 from public.eaf_v2_staff_permissions where user_id=p_user_id) then
    raise exception 'V2 staff permission profile not found';
  end if;

  update public.eaf_v2_staff_permissions
  set
    can_access_apply = case when p_app_code='apply' then p_allowed else can_access_apply end,
    can_access_hr = case when p_app_code='hr' then p_allowed else can_access_hr end,
    can_access_jd_manual = case when p_app_code='jd_manual' then p_allowed else can_access_jd_manual end,
    can_access_hr_law = case when p_app_code='hr_law' then p_allowed else can_access_hr_law end
  where user_id=p_user_id;

  insert into public.eaf_v2_gateway_access_log(user_id,event_code,app_code,details)
  values(auth.uid(),'permission_change',p_app_code,jsonb_build_object('target_user_id',p_user_id,'allowed',p_allowed));

  return true;
end;
$function$
;
CREATE FUNCTION public.eaf_v2_gateway_staff_directory()
 RETURNS TABLE(id uuid, full_name text, email text, account_status text, is_admin boolean, is_super_admin boolean, can_access_apply boolean, can_access_hr boolean, can_access_jd_manual boolean, can_access_hr_law boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.eaf_v2_is_admin(auth.uid()) then
    raise exception 'V2 Administrator access required' using errcode='42501';
  end if;

  return query
  select
    u.id,
    coalesce(nullif(s.full_name,''),u.email,'')::text,
    coalesce(u.email,'')::text,
    case
      when u.banned_until is not null and u.banned_until > now() then 'disabled'
      when u.email_confirmed_at is null then 'pending'
      else 'active'
    end::text,
    coalesce(v.is_admin,false),
    coalesce(v.is_super_admin,false),
    coalesce(v.can_access_apply,false),
    coalesce(v.can_access_hr,false),
    coalesce(v.can_access_jd_manual,false),
    coalesce(v.can_access_hr_law,false)
  from auth.users u
  left join public.eaf_staff_profiles s on s.id=u.id
  left join public.eaf_v2_staff_permissions v on v.user_id=u.id
  where s.id is not null or v.user_id is not null
  order by lower(coalesce(nullif(s.full_name,''),u.email,'')),lower(coalesce(u.email,''));
end;
$function$
;
CREATE FUNCTION public.eaf_v2_is_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select coalesce(p.is_admin,false) or coalesce(p.is_super_admin,false)
    from public.eaf_v2_staff_permissions p
    where p.user_id=p_user_id
      and p_user_id=auth.uid()
  ),false);
$function$
;
CREATE FUNCTION public.eaf_v2_is_super_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select coalesce(p.is_super_admin,false)
    from public.eaf_v2_staff_permissions p
    where p.user_id=p_user_id
      and p_user_id=auth.uid()
  ),false);
$function$
;
CREATE FUNCTION public.eaf_v2_set_staff_permissions(p_user_id uuid, p_changes jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_super boolean := false;
begin
  if not public.eaf_v2_is_admin(auth.uid()) then
    raise exception 'V2 Administrator access required' using errcode='42501';
  end if;

  if p_user_id is null or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'A target user and permission change object are required';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_changes) as j(key)
    where key not in (
      'is_admin',
      'can_view_applications',
      'can_view_only',
      'can_edit_office_use',
      'can_generate_letter',
      'can_change_status',
      'can_delete',
      'can_view_summary',
      'can_load_json_files',
      'can_import_edit_drafts',
      'can_submit_drafts'
    )
  ) then
    raise exception 'Unsupported V2 permission field';
  end if;

  select is_super_admin into v_target_super
  from public.eaf_v2_staff_permissions
  where user_id=p_user_id;

  if not found then
    raise exception 'V2 staff permission profile not found';
  end if;

  -- Super Admin status itself is intentionally not mutable from the browser.
  if v_target_super and (p_changes ? 'is_admin') then
    raise exception 'V2 Super Administrator role cannot be changed from Manage Staff';
  end if;

  update public.eaf_v2_staff_permissions
  set
    is_admin = case when p_changes ? 'is_admin'
      then (p_changes->>'is_admin')::boolean else is_admin end,

    -- View applications and View Only are mutually exclusive.
    can_view_applications = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_view_applications' then (p_changes->>'can_view_applications')::boolean
      else can_view_applications end,

    can_view_only = case
      when p_changes ? 'can_view_applications' and (p_changes->>'can_view_applications')::boolean then false
      when p_changes ? 'can_view_only' then (p_changes->>'can_view_only')::boolean
      else can_view_only end,

    -- Enabling View Only clears all V2 mutation permissions at DB level too.
    can_edit_office_use = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_edit_office_use' then (p_changes->>'can_edit_office_use')::boolean
      else can_edit_office_use end,
    can_generate_letter = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_generate_letter' then (p_changes->>'can_generate_letter')::boolean
      else can_generate_letter end,
    can_change_status = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_change_status' then (p_changes->>'can_change_status')::boolean
      else can_change_status end,
    can_delete = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_delete' then (p_changes->>'can_delete')::boolean
      else can_delete end,
    can_view_summary = case when p_changes ? 'can_view_summary'
      then (p_changes->>'can_view_summary')::boolean else can_view_summary end,
    can_load_json_files = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_load_json_files' then (p_changes->>'can_load_json_files')::boolean
      else can_load_json_files end,
    can_import_edit_drafts = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_import_edit_drafts' then (p_changes->>'can_import_edit_drafts')::boolean
      else can_import_edit_drafts end,
    can_submit_drafts = case
      when p_changes ? 'can_view_only' and (p_changes->>'can_view_only')::boolean then false
      when p_changes ? 'can_submit_drafts' then (p_changes->>'can_submit_drafts')::boolean
      else can_submit_drafts end
  where user_id=p_user_id;

  return true;
end;
$function$
;
CREATE FUNCTION public.eaf_v2_touch_staff_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$function$
;
create trigger trg_eaf_v2_touch_staff_permissions before update on public.eaf_v2_staff_permissions for each row execute function public.eaf_v2_touch_staff_permissions();
create policy eaf_v2_permissions_select on public.eaf_v2_staff_permissions for select to authenticated using(user_id=auth.uid() or public.eaf_v2_is_admin(auth.uid()));
grant select on public.eaf_v2_staff_permissions to authenticated;
insert into public.eaf_staff_profiles(id,full_name) select id,'EDP disposable staging test' from auth.users where email in ('edp-test-super@example.invalid','edp-test-admin@example.invalid','edp-test-user@example.invalid');
insert into public.eaf_v2_staff_permissions(user_id,is_admin,is_super_admin,can_access_hr)
select id,email in ('edp-test-super@example.invalid','edp-test-admin@example.invalid'),email='edp-test-super@example.invalid',true from auth.users where email in ('edp-test-super@example.invalid','edp-test-admin@example.invalid','edp-test-user@example.invalid');
revoke all on function public.eaf_v2_is_admin(uuid) from public,anon;
grant execute on function public.eaf_v2_is_admin(uuid) to authenticated;
revoke all on function public.eaf_v2_is_super_admin(uuid) from public,anon;
grant execute on function public.eaf_v2_is_super_admin(uuid) to authenticated;
revoke all on function public.eaf_v2_set_staff_permissions(uuid,jsonb) from public,anon;
grant execute on function public.eaf_v2_set_staff_permissions(uuid,jsonb) to authenticated;
revoke all on function public.eaf_v2_gateway_staff_directory() from public,anon;
grant execute on function public.eaf_v2_gateway_staff_directory() to authenticated;
revoke all on function public.eaf_v2_gateway_get_access_log(integer) from public,anon;
grant execute on function public.eaf_v2_gateway_get_access_log(integer) to authenticated;
revoke all on function public.eaf_v2_gateway_set_user_access(uuid,text,boolean) from public,anon;
grant execute on function public.eaf_v2_gateway_set_user_access(uuid,text,boolean) to authenticated;
revoke all on function public.eaf_v2_touch_staff_permissions() from public,anon,authenticated;
-- Review only: apply after approval. No existing role or application flag is changed.

create schema if not exists eaf_v2_role_private;

-- Protect every write path, including the older Manage Staff RPC.
create or replace function eaf_v2_role_private.eaf_v2_guard_admin_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    if coalesce(old.is_admin,false) or coalesce(old.is_super_admin,false) then
      raise exception 'Revoke administrator before removing this permission profile; super administrators are protected' using errcode='42501';
    end if;
    return old;
  end if;
  if TG_OP = 'INSERT' then
    if coalesce(new.is_admin,false) or coalesce(new.is_super_admin,false) then
      raise exception 'Create an ordinary profile first, then use administrator assignment' using errcode='42501';
    end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'User identity and super administrator role are protected' using errcode='42501';
  end if;
  if new.is_admin is distinct from old.is_admin then
    if auth.uid() is null or not public.eaf_v2_is_super_admin(auth.uid()) then
      raise exception 'Super administrator access required' using errcode='42501';
    end if;
    if new.user_id = auth.uid() or coalesce(old.is_super_admin,false) then
      raise exception 'Cannot change your own role or a super administrator role' using errcode='42501';
    end if;
    if new.is_admin is null then
      raise exception 'Administrator role must be true or false' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function eaf_v2_role_private.eaf_v2_guard_admin_roles() from public, anon, authenticated;
create trigger eaf_v2_guard_admin_roles before insert or update or delete
on public.eaf_v2_staff_permissions for each row execute function eaf_v2_role_private.eaf_v2_guard_admin_roles();

create or replace function eaf_v2_role_private.eaf_v2_audit_admin_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_admin is distinct from old.is_admin then
    insert into public.eaf_v2_gateway_access_log(user_id,event_code,details)
    values(auth.uid(),'administrator_role_change',jsonb_build_object(
      'target_user_id',new.user_id,'previous_is_admin',old.is_admin,
      'is_admin',new.is_admin,'action',case when new.is_admin then 'grant' else 'revoke' end));
  end if;
  return new;
end $$;
revoke all on function eaf_v2_role_private.eaf_v2_audit_admin_role() from public, anon, authenticated;
create trigger eaf_v2_audit_admin_role after update of is_admin
on public.eaf_v2_staff_permissions for each row execute function eaf_v2_role_private.eaf_v2_audit_admin_role();

create or replace function eaf_v2_role_private.eaf_v2_set_administrator(
  p_user_id uuid, p_enabled boolean, p_expected_is_admin boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_target public.eaf_v2_staff_permissions%rowtype;
begin
  if auth.uid() is null or not public.eaf_v2_is_super_admin(auth.uid()) then
    raise exception 'Super administrator access required' using errcode='42501';
  end if;
  if p_user_id is null or p_enabled is null or p_expected_is_admin is null then
    raise exception 'Target user, desired role and expected role are required' using errcode='22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot change your own administrator role' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users u join public.eaf_staff_profiles s on s.id=u.id
    where u.id=p_user_id and (not p_enabled or (u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())))) then
    raise exception 'Existing active staff account required to grant administrator' using errcode='22023';
  end if;
  insert into public.eaf_v2_staff_permissions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into strict v_target from public.eaf_v2_staff_permissions where user_id=p_user_id for update;
  if coalesce(v_target.is_super_admin,false) then
    raise exception 'Super administrator role is protected' using errcode='42501';
  end if;
  if coalesce(v_target.is_admin,false) <> p_expected_is_admin then
      -- HTTP conflict, not serialization_failure (40001), which PostgREST may retry.
      raise exception 'Role changed since loading. Refresh Users and confirm again.' using errcode='PT409';
  end if;
  if coalesce(v_target.is_admin,false) <> p_enabled then
    update public.eaf_v2_staff_permissions set is_admin=p_enabled where user_id=p_user_id;
  end if;
  return p_enabled;
end $$;
revoke all on function eaf_v2_role_private.eaf_v2_set_administrator(uuid,boolean,boolean) from public, anon;
grant usage on schema eaf_v2_role_private to authenticated;
grant execute on function eaf_v2_role_private.eaf_v2_set_administrator(uuid,boolean,boolean) to authenticated;

create or replace function public.eaf_v2_set_administrator(
  p_user_id uuid, p_enabled boolean, p_expected_is_admin boolean
) returns boolean language sql security invoker set search_path = '' as $$
  select eaf_v2_role_private.eaf_v2_set_administrator(p_user_id,p_enabled,p_expected_is_admin);
$$;
revoke all on function public.eaf_v2_set_administrator(uuid,boolean,boolean) from public, anon;
grant execute on function public.eaf_v2_set_administrator(uuid,boolean,boolean) to authenticated;


commit;
