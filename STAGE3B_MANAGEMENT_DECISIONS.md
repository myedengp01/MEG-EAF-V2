# MEG-Employment & HR System V2 — Stage 3B Management Decisions

Effective build: **v2026.09.16-11:17**

## Legal-employer master data
Management confirmed the currently recorded registration details, business/registered addresses, phone numbers and emails for all four legal employers:
- MyEden Group Sdn. Bhd. (MEG)
- MyEden Edu Hub Sdn. Bhd. (MEH)
- Happy Dino Sdn. Bhd. (HDS)
- Aborne Project Sdn. Bhd. (ABN)

Stage 3B therefore changes the LOEC company-profile issue gate from `review_required` to `verified` for all four employers.

## Probation defaults
Management approved the group-standard defaults for HDS and ABN:
- Probation: **3 months**
- Notice during probation: **4 weeks**

MEG and MEH retain the same existing defaults.

## Aborne approved role architecture
- L1 — Event Admin
- L2 — Event Executive
- L3 — Event Manager
- L2 — Sales Executive
- L2 — Operations Executive

The Stage 3B frontend fallback uses these approved roles when the authenticated JD database has not yet been seeded/connected. A staging DB seed must be generated only after the live `jd_*` schema/constraints are verified.
