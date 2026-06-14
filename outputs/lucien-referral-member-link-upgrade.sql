-- LUCIEN referral member link upgrade
-- Links an approved referral/application to the member profile created from it.

alter table public.referrals
add column if not exists accepted_profile_id uuid references public.profiles(id) on delete set null,
add column if not exists invite_sent_at timestamptz;

create index if not exists referrals_accepted_profile_idx
on public.referrals (accepted_profile_id);
