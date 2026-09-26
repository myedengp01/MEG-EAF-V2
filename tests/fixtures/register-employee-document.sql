CREATE OR REPLACE FUNCTION public.register_employee_document(p_employee_id uuid, p_document_type text, p_document_label text, p_file_name text, p_storage_path text, p_mime_type text DEFAULT NULL::text, p_file_size_bytes bigint DEFAULT NULL::bigint, p_document_date date DEFAULT NULL::date, p_expiry_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS employee_documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_doc public.employee_documents;
  v_can_change boolean;
  v_expected_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select (sp.is_admin or sp.can_edit_office_use or sp.can_change_status)
    into v_can_change
  from public.eaf_staff_profiles sp
  where sp.id=auth.uid();
  if coalesce(v_can_change,false)=false then raise exception 'You do not have permission to register employee documents'; end if;
  if not exists(select 1 from public.employee_master where id=p_employee_id) then raise exception 'Employee not found'; end if;
  if nullif(btrim(coalesce(p_document_type,'')),'') is null then raise exception 'Document type is required'; end if;
  if nullif(btrim(coalesce(p_file_name,'')),'') is null then raise exception 'File name is required'; end if;
  if nullif(btrim(coalesce(p_storage_path,'')),'') is null then raise exception 'Storage path is required'; end if;
  v_expected_prefix := p_employee_id::text || '/';
  if left(p_storage_path,length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'Storage path must be inside the employee folder';
  end if;
  if p_file_size_bytes is not null and p_file_size_bytes>10485760 then raise exception 'File exceeds 10 MB limit'; end if;
  if p_mime_type is not null and p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'Unsupported document MIME type: %',p_mime_type; end if;

  insert into public.employee_documents(
    employee_id_ref,document_type,document_label,file_name,storage_path,mime_type,file_size_bytes,
    document_date,expiry_date,is_current,note,source_type,source_payload,uploaded_by
  ) values (
    p_employee_id,btrim(p_document_type),nullif(btrim(coalesce(p_document_label,'')),''),btrim(p_file_name),p_storage_path,
    p_mime_type,p_file_size_bytes,p_document_date,p_expiry_date,true,nullif(btrim(coalesce(p_note,'')),''),
    'manual_entry','{}'::jsonb,auth.uid()
  ) returning * into v_doc;

  insert into public.employee_events(employee_id_ref,event_type,note,payload,changed_by)
  values(
    p_employee_id,
    'employee_document_added',
    nullif(btrim(coalesce(p_note,'')),''),
    jsonb_build_object('document_id',v_doc.id,'document_type',v_doc.document_type,'file_name',v_doc.file_name,'storage_path',v_doc.storage_path),
    auth.uid()
  );

  return v_doc;
end;
$function$
