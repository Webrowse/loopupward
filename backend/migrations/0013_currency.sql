-- Multi-currency billing: subscriptions/plan grants now carry the currency
-- they were billed in (INR or USD). Nullable, matching `plan`'s nullability
-- for legacy rows and admin-granted premium (no real payment currency).
--
-- Numbered 0013, not 0011: 0012 shipped first and sqlx SILENTLY SKIPS any
-- migration older than the newest applied one — a 0011 added now would log
-- "migrations applied" while never running. "if not exists" because dev
-- databases already ran this DDL under the abandoned 0011 number.
alter table users add column if not exists currency text;
alter table subscriptions add column if not exists currency text;
