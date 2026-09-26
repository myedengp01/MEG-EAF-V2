-- Minimal schema-only employee-document fixture, no employee data.
create table public.employee_documents(id uuid primary key default gen_random_uuid(),employee_id_ref uuid references public.employee_master(id),document_type text,document_label text,file_name text,storage_path text,mime_type text,file_size_bytes bigint,document_date date,expiry_date date,is_current boolean,note text,source_type text,source_payload jsonb,uploaded_by uuid,uploaded_at timestamptz default now());
create table public.employee_events(id uuid primary key default gen_random_uuid(),employee_id_ref uuid references public.employee_master(id),event_type text,note text,payload jsonb,changed_by uuid,created_at timestamptz default now());
alter table public.employee_documents enable row level security;
alter table public.employee_events enable row level security;
revoke all on public.employee_documents,public.employee_events from anon,authenticated;
