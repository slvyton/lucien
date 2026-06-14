-- LUCIEN member onboarding upgrade
-- Stores accepted direct-invite onboarding details before Stripe is wired.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.member_onboarding (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  selected_tier text not null,
  quarterly_price numeric(10,2) not null,
  full_name text not null,
  email text not null,
  phone text,
  city text,
  profession_company text,
  referral_code text,
  referred_by_name text,
  why_lucien text,
  interests text[] not null default '{}',
  dietary_access_notes text,
  instagram text,
  linkedin text,
  website text,
  payment_status text not null default 'pending',
  stripe_customer_id text,
  stripe_subscription_id text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id)
);

alter table public.member_onboarding enable row level security;

drop policy if exists "members read own onboarding" on public.member_onboarding;
create policy "members read own onboarding" on public.member_onboarding
for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "members submit own onboarding" on public.member_onboarding;
create policy "members submit own onboarding" on public.member_onboarding
for insert with check (profile_id = auth.uid());

drop policy if exists "members update own onboarding" on public.member_onboarding;
create policy "members update own onboarding" on public.member_onboarding
for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "admins manage onboarding" on public.member_onboarding;
create policy "admins manage onboarding" on public.member_onboarding
for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists member_onboarding_touch_updated_at on public.member_onboarding;
create trigger member_onboarding_touch_updated_at before update on public.member_onboarding
for each row execute function public.set_updated_at();
