# CS leave reuse review — 2026-11-03

## Implemented scope
Dedicated /cs-tools/leave renders the existing LeavePageClient (real existing application/cancellation/approval API), not a mock. Adds a CS navigation entry and routes the existing CS leave card into the dedicated CS page. Both lounge branches already had a leave card; the earlier partial read incorrectly inferred a hidden-card defect. No duplicate card is added. Fresh DB account role/department/disabled checks; company mode retained. Management link uses the existing canViewEmployeeLeaveSummary rule. No API authorization, role, accrual formula, balance, schema or notification changes.

## Existing implementation and access
- /leave, GET/POST /api/leave; PATCH /api/leave/{id}; employee summary/detail/adjust routes under /api/admin.
- Models LeaveRequest, LeaveAccrual, LeaveBalance, LeaveAdjustment. KST calculation and FIFO approved consumption already exist.
- Ordinary CS staff: own request statuses and CS-group approved schedule. Serializer hides peer reason/email/project from ordinary staff; existing leave type/dates/name still visible in approved schedule.
- First approval: same exact normalized department TEAM_LEAD. CS ordinary staff/team lead final approval: same department CENTER_CHIEF. Team lead and chief skip first step; chief applications go to existing executive/admin approval. Applicant cannot self-approve. No new approver assignment.
- Existing summary: CS-team TEAM_LEAD/CENTER_CHIEF see CS scope; ADMIN/EXECUTIVE existing all scope. Manual balance adjustment remains ADMIN/EXECUTIVE only.
- Read-only aggregate metadata: CS팀 active USER 28, TEAM_LEAD 2, CENTER_CHIEF 1. No names, balances, medical reasons or employee documents queried. Both same-department team leads currently qualify; assigning a specific lead would require a separate business decision.

## Important existing behavior / validation boundary
GET /api/leave calls calculateLeavePool (ensure accruals, legacy/balance carry, approved consumption) and balance sync. Employee summary GET also calculates pools. skipAccrue is NOT fully read-only because carry helpers still execute. Do not use these production GETs as a non-destructive test. No live leave page/API authenticated GET or POST/PATCH was invoked during this change. No employee balances were estimated, imported, reset or overwritten.
Google Sites failure and data loss are reported, not proven. This change neither migrates nor recovers Google data. Existing CRM balances must be reconciled to confirmed original records before relying on them for newly onboarded staff. No blanket 15-day initialization or historical-use backfill is included.

## Rollout and rollback
Only UI/navigation/access-to-new-entry code plus synthetic tests/docs. No DB migration/permissions/credentials. Revert this commit to remove the new CS entry; original /leave and all stored data remain. Do not reset balance or roles for rollback.
Real CS/admin session checks and end-to-end submission/approval remain separate from mocked tests because current GET itself may write balances. A safe live acceptance needs an explicitly identified synthetic/test account and verified balance setup, or approval of the existing synchronization behavior for a specified real account. Do not impersonate staff or submit a real leave request for testing.
