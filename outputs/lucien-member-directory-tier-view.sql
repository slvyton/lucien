-- LUCIEN member directory tier view
-- Lets authenticated members see public tier labels for visible directory profiles
-- without exposing private membership fields like pricing or notes.

create or replace view public.member_directory_tiers
with (security_invoker = false)
as
select
  m.profile_id,
  m.tier
from public.memberships m
join public.profiles p on p.id = m.profile_id
where p.is_directory_visible = true
  and m.status <> 'cancelled';

grant select on public.member_directory_tiers to authenticated;
