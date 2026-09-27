-- Reproducible migration for issuance objects verified in Supabase on 2026-09-22.
-- Issuance does not deliver letters or notify employees.
create or replace function public.hr_letters_admin_issue(p_letter uuid)
returns text language plpgsql security definer set search_path=public,auth as $$
declare r public.hr_letter_records%rowtype; v_super boolean; v_preview text; v_snapshot jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(is_super_admin,false) into v_super from public.eaf_v2_staff_permissions where user_id=auth.uid();
 if not coalesce(v_super,false) then raise exception 'Super administrator issuance required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter for update;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 if r.status<>'approved' or r.approved_at is null or r.approved_by is null then raise exception 'Only approved letters may be issued' using errcode='22023'; end if;
 if r.created_by=auth.uid() then raise exception 'Creator cannot issue own letter' using errcode='42501'; end if;
 if r.issued_snapshot is not null then raise exception 'Issued snapshot already exists' using errcode='22023'; end if;
 v_preview:=nullif(r.source_snapshot->>'approved_preview','');
 if v_preview is null or v_preview<>r.source_snapshot->>'submitted_preview' then raise exception 'Frozen approved preview missing or inconsistent' using errcode='22023'; end if;
 v_snapshot:=jsonb_build_object('letter_id',r.id,'employee_id',r.employee_id,'company_code',r.company_code,'template_code',r.template_code,'template_version',r.template_version,'letter_text',v_preview,'approved_by',r.approved_by,'approved_at',r.approved_at,'issued_by',auth.uid(),'issued_at',now());
 update public.hr_letter_records set status='issued',issued_snapshot=v_snapshot,issued_by=auth.uid(),issued_at=now(),updated_at=now() where id=p_letter;
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'issued',v_snapshot);
 return 'issued';
end $$;
revoke all on function public.hr_letters_admin_issue(uuid) from public,anon;
grant execute on function public.hr_letters_admin_issue(uuid) to authenticated;

create or replace function public.hr_letters_admin_view(p_letter uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare r public.hr_letter_records%rowtype;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 return jsonb_build_object('id',r.id,'status',r.status,'employee_id',r.employee_id,'company_code',r.company_code,'template_code',r.template_code,'template_version',r.template_version,'text',case when r.status='issued' then r.issued_snapshot->>'letter_text' when r.status='approved' then r.source_snapshot->>'approved_preview' when r.status='pending_approval' then r.source_snapshot->>'submitted_preview' else null end,'approved_at',r.approved_at,'issued_at',r.issued_at);
end $$;
revoke all on function public.hr_letters_admin_view(uuid) from public,anon;
grant execute on function public.hr_letters_admin_view(uuid) to authenticated;

create or replace function public.hr_letters_protect_issued()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.status='issued' or old.issued_snapshot is not null then raise exception 'Issued letters are immutable' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists hr_letters_issued_immutable on public.hr_letter_records;
create trigger hr_letters_issued_immutable before delete or update on public.hr_letter_records for each row execute function public.hr_letters_protect_issued();
