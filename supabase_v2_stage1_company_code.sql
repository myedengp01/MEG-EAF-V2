-- MEG-EAF V2 — Stage 1 optional database migration
-- Run in a staging Supabase project first. The V2 frontend remains backward-compatible
-- with V1 records that only store companyCode inside payload JSON.

begin;

alter table if exists public.eaf_applications
  add column if not exists company_code text;

alter table if exists public.eaf_drafts
  add column if not exists company_code text;

update public.eaf_applications
set company_code = coalesce(nullif(company_code,''), nullif(payload->>'companyCode',''), 'meg')
where company_code is null or company_code='';

update public.eaf_drafts
set company_code = coalesce(nullif(company_code,''), nullif(payload->>'companyCode',''), 'meg')
where company_code is null or company_code='';

create index if not exists idx_eaf_applications_company_code on public.eaf_applications(company_code);
create index if not exists idx_eaf_drafts_company_code on public.eaf_drafts(company_code);

-- Keep the first-class company_code column aligned with the existing payload.companyCode.
create or replace function public.eaf_v2_sync_company_code()
returns trigger
language plpgsql
as $$
begin
  new.company_code := coalesce(nullif(new.company_code,''), nullif(new.payload->>'companyCode',''), 'meg');
  return new;
end;
$$;

drop trigger if exists trg_eaf_v2_sync_company_code_apps on public.eaf_applications;
create trigger trg_eaf_v2_sync_company_code_apps
before insert or update of payload, company_code on public.eaf_applications
for each row execute function public.eaf_v2_sync_company_code();

drop trigger if exists trg_eaf_v2_sync_company_code_drafts on public.eaf_drafts;
create trigger trg_eaf_v2_sync_company_code_drafts
before insert or update of payload, company_code on public.eaf_drafts
for each row execute function public.eaf_v2_sync_company_code();

commit;
