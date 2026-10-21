-- ===========================================================================
-- v2.4 — repair grievance rows whose acknowledged_at was never written
--
-- The application fix (no-store on every database read) stops stale reads; this
-- backfills the rows that were already affected so their timelines are correct.
-- Idempotent: safe to re-run.
-- ===========================================================================

update grievances
set acknowledged_at = coalesce(acknowledged_at, resolved_at, updated_at)
where status in ('ACKNOWLEDGED','RESOLVED','REJECTED','CLOSED')
  and acknowledged_at is null;

select
  (select count(*) from grievances)                                                   as grievances,
  (select count(*) from grievances where status = 'ACKNOWLEDGED')                     as acknowledged,
  (select count(*) from grievances where status <> 'SUBMITTED' and acknowledged_at is null) as still_missing_ack;
