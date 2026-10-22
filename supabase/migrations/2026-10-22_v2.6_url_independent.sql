-- ===========================================================================
-- v2.6 — a URL may be independent of any template, and method is no longer
--        collected from the enterprise.
-- Idempotent: safe to re-run.
-- ===========================================================================
alter table url_registrations alter column template_id drop not null;
alter table url_registrations alter column method set default 'POST';
alter table url_registrations alter column method drop not null;
