MEG-Employment & HR System V2 — Stage 3B GitHub Update Overlay
Build: v2026.09.16-11:17

This overlay reconciles:
1) current GitHub secure Dashboard Gateway,
2) validated Stage 3 application source,
3) Stage 3A DB-MEG-FORMS reference,
4) Management-approved employer verification, HDS/ABN probation defaults, and Aborne roles.

IMPORTANT
- No production Supabase SQL is executed by this overlay.
- 009_STAGE3B_ABORNE_JD_STAGING_PREFLIGHT.sql is PRE-FLIGHT ONLY.
- APPLY_STAGE3B_TO_GITHUB.ps1 creates a branch and does not push unless you pass -Push.

Recommended:
  PowerShell -ExecutionPolicy Bypass -File .\APPLY_STAGE3B_TO_GITHUB.ps1
Review the branch, then:
  PowerShell -ExecutionPolicy Bypass -File .\APPLY_STAGE3B_TO_GITHUB.ps1 -Push
