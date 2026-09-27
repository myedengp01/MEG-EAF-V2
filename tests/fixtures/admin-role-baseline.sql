-- Schema-only fixture captured from project vzngfswtofegimfcoigx on 2026-09-22.
-- Auth/profile tables below are minimal test doubles; no production user data.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
create table auth.users(id uuid primary key, email_confirmed_at timestamptz, banned_until timestamptz);
create table public.eaf_staff_profiles(id uuid primary key references auth.users(id));
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
 primary key (user_id)
);
create table public.eaf_v2_gateway_access_log (
  id bigint generated always as identity not null,
  user_id uuid,
  event_code text not null,
  app_code text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
 primary key (id)
);
alter table public.eaf_v2_staff_permissions add foreign key(user_id) references public.eaf_staff_profiles(id) on delete cascade;
CREATE OR REPLACE FUNCTION public.eaf_v2_gateway_set_user_access(p_user_id uuid, p_app_code text, p_allowed boolean)
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
CREATE OR REPLACE FUNCTION public.eaf_v2_is_admin(p_user_id uuid DEFAULT auth.uid())
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
CREATE OR REPLACE FUNCTION public.eaf_v2_is_super_admin(p_user_id uuid DEFAULT auth.uid())
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
CREATE OR REPLACE FUNCTION public.eaf_v2_set_staff_permissions(p_user_id uuid, p_changes jsonb)
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
CREATE OR REPLACE FUNCTION public.eaf_v2_touch_staff_permissions()
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
alter table public.eaf_v2_staff_permissions enable row level security;
create policy eaf_v2_permissions_select on public.eaf_v2_staff_permissions for select to authenticated using(user_id=auth.uid() or public.eaf_v2_is_admin(auth.uid()));
grant select,insert,update,delete on public.eaf_v2_staff_permissions to authenticated;

