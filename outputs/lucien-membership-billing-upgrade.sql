-- LUCIEN membership billing upgrade
-- Tracks whether a member is paying, comped, trialing, or paused for executive reporting.

alter table public.memberships
add column if not exists billing_status text;

update public.memberships
set billing_status = coalesce(billing_status, case
  when coalesce(quarterly_price, 0) <= 0 then 'comped'
  else 'paid'
end);

alter table public.memberships
alter column billing_status set default 'paid';

alter table public.memberships
alter column billing_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memberships_billing_status_check'
      and conrelid = 'public.memberships'::regclass
  ) then
    alter table public.memberships
    add constraint memberships_billing_status_check
    check (billing_status in ('paid', 'comped', 'trial', 'paused'));
  end if;
end $$;
