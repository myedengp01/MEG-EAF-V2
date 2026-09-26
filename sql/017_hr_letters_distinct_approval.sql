-- Applied to Supabase on 2026-09-22 as hr_letters_distinct_super_admin_approval_20260922.
-- Creator and approver must be different users. No automatic issuance.
create or replace function public.hr_letters_admin_decide(p_letter uuid,p_approve boolean,p_reason text default null)
returns text language plpgsql volatile security definer set search_path=public,auth as $$
declare r public.hr_letter_records%rowtype; v_super boolean; v_preview text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(is_super_admin,false) into v_super from public.eaf_v2_staff_permissions where user_id=auth.uid();
 if not coalesce(v_super,false) then raise exception 'Separate super administrator approval required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter for update;
 if not found then raise exception 'Letter not found' using errcode='22023'; end if;
 if r.status<>'pending_approval' then raise exception 'Only pending letters may be decided' using errcode='22023'; end if;
 if r.created_by=auth.uid() then raise exception 'Creator cannot approve or reject their own letter' using errcode='42501'; end if;
 if p_approve is null then raise exception 'Decision required' using errcode='22023'; end if;
 v_preview:=nullif(r.source_snapshot->>'submitted_preview','');
 if v_preview is null then raise exception 'Submitted preview missing' using errcode='22023'; end if;
 if p_approve then
  update public.hr_letter_records set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now(),source_snapshot=source_snapshot||jsonb_build_object('approved_preview',v_preview,'approved_template_version',r.template_version) where id=p_letter;
  insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'approved',jsonb_build_object('template_version',r.template_version,'approved_preview',v_preview));
  return 'approved';
 else
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Rejection reason required' using errcode='22023'; end if;
  update public.hr_letter_records set status='void',updated_at=now(),source_snapshot=source_snapshot||jsonb_build_object('rejected_at',now(),'rejection_reason',left(p_reason,2000)) where id=p_letter;
  insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(p_letter,auth.uid(),'rejected',jsonb_build_object('reason',left(p_reason,2000)));
  return 'void';
 end if;
end $$;
revoke all on function public.hr_letters_admin_decide(uuid,boolean,text) from public,anon;
grant execute on function public.hr_letters_admin_decide(uuid,boolean,text) to authenticated;
