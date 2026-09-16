-- MEG-Employment & HR System V2 — Stage 3B
-- Aborne JD Master staging seed PRE-FLIGHT / TEMPLATE
-- Build: v2026.09.16-14:00
-- IMPORTANT: DO NOT RUN IN PRODUCTION YET.
-- The frontend now has the Management-approved Aborne fallback roles.
-- Before database seeding, inspect the live/staging jd_* schema and constraints, then adapt/approve this template.

-- Approved role architecture:
-- L1 Event Admin                  | Event & Administration       | Event Executive / Event Manager
-- L2 Event Executive              | Event & Project              | Event Manager
-- L3 Event Manager                | Event & Project              | Director / Management
-- L2 Sales Executive              | Sales & Business Development | Event Manager / Director
-- L2 Operations Executive         | Operations                   | Event Manager

-- Preflight only:
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('jd_entities','jd_departments','jd_positions','jd_responsibilities','jd_competencies','jd_core_values','jd_kpis')
order by table_name, ordinal_position;

-- After staging schema verification, produce the idempotent seed migration.
