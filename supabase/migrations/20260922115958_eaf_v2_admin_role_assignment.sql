-- Review only: apply after approval. No existing role or application flag is changed.
begin;
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
    raise exception 'Role changed since loading. Refresh Users and confirm again.' using errcode='40001';
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
