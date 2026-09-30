begin;
set local lock_timeout='2s';
create or replace function public.hr_letters_register_signed_copy(p_letter uuid,p_file_name text,p_storage_path text,p_mime_type text,p_file_size_bytes bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.hr_letter_records%rowtype; d record; o record;
begin
 if auth.uid() is null or not public.eaf_v2_is_admin(auth.uid()) then raise exception 'HR Letters administrator access required' using errcode='42501'; end if;
 select * into r from public.hr_letter_records where id=p_letter for share;
 if not found or r.status<>'issued' then raise exception 'Signed copy requires an issued letter' using errcode='22023'; end if;
 if p_storage_path is null or p_storage_path !~ ('^'||r.employee_id::text||'/[0-9a-f-]{36}\.(pdf|jpg|png)$') then raise exception 'Invalid employee document path' using errcode='22023'; end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_mime_type is null or p_file_size_bytes is null or p_file_size_bytes not between 1 and 10485760 then raise exception 'Invalid signed document' using errcode='22023'; end if;
 select * into o from storage.objects where bucket_id='employee-documents' and name=p_storage_path;
 if not found or o.owner_id is distinct from auth.uid()::text then raise exception 'Uploaded document ownership required' using errcode='42501'; end if;
 if (o.metadata->>'size')::bigint is distinct from p_file_size_bytes or o.metadata->>'mimetype' is distinct from p_mime_type then raise exception 'Uploaded document metadata mismatch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_storage_path,0));
 if exists(select 1 from public.employee_documents where storage_path=p_storage_path) then raise exception 'Document already registered' using errcode='22023'; end if;
 -- The existing RPC enforces the employee-document permission separately and writes employee_events.
 select * into d from public.register_employee_document(r.employee_id,'signed_hr_letter',r.template_code||' signed letter',p_file_name,p_storage_path,p_mime_type,p_file_size_bytes,current_date,null,'Signed copy for letter '||r.id::text);
 insert into public.hr_letter_audit(letter_id,actor_id,action,event_snapshot) values(r.id,auth.uid(),'signed_copy_registered',jsonb_build_object('document_id',d.id,'storage_path',p_storage_path));
 return d.id;
end $$;
revoke all on function public.hr_letters_register_signed_copy(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.hr_letters_register_signed_copy(uuid,text,text,text,bigint) to authenticated;
commit;
