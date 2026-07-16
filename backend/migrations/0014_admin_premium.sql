-- Split premium ownership: premium_until belongs to the payment provider
-- (confirm/webhook write it), admin_premium_until belongs to owner grants.
-- Before this, both wrote one column and a renewal webhook silently wiped
-- any admin grant sitting in it. Access is now the LATER of the two at
-- read time; neither writer touches the other's clock.
alter table users add column admin_premium_until timestamptz;
