-- MEG-HR-LMS V1.0 v2026.09.21-14:30. NOT APPLIED TO PRODUCTION.
-- Additive schema only; intentionally no gateway registration until UI and tests exist.
create extension if not exists pgcrypto;
create table if not exists public.hr_letter_templates (
 code text primary key check (code in ('RL','LOP','LOC_LOI','EL','DI','SAL','UAL','TRL','TL','PIP','WL','PEL','SCL','LOI','LOC')),
 title text not null, version text not null, body text not null,
 active boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists public.hr_letter_records (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employee_master(id),
 company_code text not null,
 template_code text not null references public.hr_letter_templates(code),
 template_version text not null,
 status text not null default 'draft' check (status in ('draft','pending_approval','approved','issued','void')),
 fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields)='object'),
 source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot)='object'),
 issued_snapshot jsonb,
 created_by uuid not null default auth.uid(),
 approved_by uuid, issued_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 approved_at timestamptz, issued_at timestamptz,
 constraint hr_letter_issued_snapshot_required check (status <> 'issued' or (issued_snapshot is not null and approved_at is not null and issued_at is not null))
);
create index if not exists hr_letter_records_employee_idx on public.hr_letter_records(employee_id,created_at desc);
create table if not exists public.hr_letter_audit (
 id uuid primary key default gen_random_uuid(),
 letter_id uuid not null references public.hr_letter_records(id),
 actor_id uuid not null default auth.uid(),
 action text not null,
 event_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists hr_letter_audit_letter_idx on public.hr_letter_audit(letter_id,created_at desc);
alter table public.hr_letter_templates enable row level security;
alter table public.hr_letter_records enable row level security;
alter table public.hr_letter_audit enable row level security;
-- No permissive policies and no authenticated grants: fail closed until reviewed
-- security-definer RPCs with explicit auth.uid(), company scope, DAL and audit are deployed.
revoke all on public.hr_letter_templates from anon, authenticated;
revoke all on public.hr_letter_records from anon, authenticated;
revoke all on public.hr_letter_audit from anon, authenticated;
