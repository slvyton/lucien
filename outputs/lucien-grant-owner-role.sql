-- LUCIEN admin access helper
-- 1. Create your login user in Supabase Auth first.
-- 2. Replace you@example.com below with that Auth user's email.
-- 3. Run this in Supabase SQL Editor.

insert into public.user_roles (user_id, role)
select id, 'owner'
from auth.users
where email = 'you@example.com'
on conflict (user_id, role) do nothing;

insert into public.profiles (
  id,
  display_name,
  email,
  initials,
  title,
  city,
  country,
  role_title,
  company,
  bio,
  industries,
  open_to,
  member_since,
  events_attended,
  referrals_count
)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'display_name', 'Michael Slayton'),
  u.email,
  'MS',
  'Lord',
  'Naples, FL',
  'United States',
  'Founder',
  'Slayton & Co.',
  'Michael founded Slayton & Co. as a quiet home for the ventures and the people he believes in, across hospitality, media, and technology.',
  array['Hospitality','Technology','Media'],
  array['Society partnerships','Creative ventures','Hospitality concepts'],
  '2024-01-01',
  5,
  2
from auth.users u
where u.email = 'you@example.com'
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name;

create unique index if not exists memberships_profile_id_unique
on public.memberships (profile_id);

insert into public.memberships (
  profile_id,
  tier,
  status,
  renewal_date,
  quarterly_price,
  referral_code,
  annual_invitation_limit,
  invitations_remaining
)
select
  u.id,
  'Emerald',
  'active',
  '2026-01-01',
  2500,
  'LCN-7H42',
  6,
  4
from auth.users u
where u.email = 'you@example.com'
on conflict (profile_id) do update set
  tier = excluded.tier,
  status = excluded.status,
  renewal_date = excluded.renewal_date,
  quarterly_price = excluded.quarterly_price,
  referral_code = excluded.referral_code,
  annual_invitation_limit = excluded.annual_invitation_limit,
  invitations_remaining = excluded.invitations_remaining;
