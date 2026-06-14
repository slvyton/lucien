-- LUCIEN MVP Supabase schema
-- Paste into Supabase SQL Editor and run once on a fresh project.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.member_status as enum ('invited', 'pending', 'active', 'paused', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'concierge', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_kind as enum ('member_event', 'retreat');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('draft', 'coming_soon', 'open', 'invite_only', 'waitlist', 'closed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('new', 'reviewing', 'approved', 'declined', 'fulfilled', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('owner', 'admin', 'concierge')
  );
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  first_name text,
  last_name text,
  title text,
  initials text,
  email text,
  phone text,
  city text,
  region text,
  country text,
  role_title text,
  company text,
  bio text,
  profile_photo_path text,
  contact_preference text default 'By introduction only',
  industries text[] not null default '{}',
  open_to text[] not null default '{}',
  is_directory_visible boolean not null default true,
  member_since date,
  events_attended integer not null default 0,
  referrals_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null default 'Emerald',
  status public.member_status not null default 'active',
  renewal_date date,
  quarterly_price numeric(10,2),
  referral_code text unique,
  annual_invitation_limit integer not null default 6,
  invitations_remaining integer not null default 6,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind public.event_kind not null,
  title text not null,
  summary text,
  description text,
  date_label text,
  start_date date,
  end_date date,
  location text,
  venue text,
  status public.event_status not null default 'draft',
  capacity integer,
  confirmed_count integer not null default 0,
  price_label text,
  dress_code text,
  host_label text,
  travel_note text,
  cta_label text,
  visibility_tiers text[] not null default '{}',
  hero_image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_inclusions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create table if not exists public.event_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day_label text not null,
  detail text not null,
  sort_order integer not null default 0
);

create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null default 'request_invite',
  status public.request_status not null default 'new',
  party_size integer,
  guest_names text,
  intention text,
  dietary_access_notes text,
  arrival_notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.concierge_services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  symbol text,
  title text not null,
  summary text,
  description text,
  form_label text,
  prompt text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.concierge_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.concierge_services(id) on delete set null,
  title text,
  details text,
  preferred_timing text,
  status public.request_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category text,
  name text not null,
  offer text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.perk_requests (
  id uuid primary key default gen_random_uuid(),
  perk_id uuid not null references public.perks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  details text,
  preferred_timing text,
  status public.request_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz,
  audience_tiers text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  preview_text text,
  body_html text,
  body_markdown text,
  status text not null default 'draft',
  audience_tiers text[] not null default '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_name text not null,
  candidate_email text,
  note text,
  status public.request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists memberships_touch_updated_at on public.memberships;
create trigger memberships_touch_updated_at before update on public.memberships
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists event_requests_touch_updated_at on public.event_requests;
create trigger event_requests_touch_updated_at before update on public.event_requests
for each row execute function public.touch_updated_at();

drop trigger if exists concierge_requests_touch_updated_at on public.concierge_requests;
create trigger concierge_requests_touch_updated_at before update on public.concierge_requests
for each row execute function public.touch_updated_at();

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.events enable row level security;
alter table public.event_inclusions enable row level security;
alter table public.event_itinerary_items enable row level security;
alter table public.event_requests enable row level security;
alter table public.concierge_services enable row level security;
alter table public.concierge_requests enable row level security;
alter table public.perks enable row level security;
alter table public.perk_requests enable row level security;
alter table public.announcements enable row level security;
alter table public.newsletters enable row level security;
alter table public.referrals enable row level security;
alter table public.admin_notes enable row level security;

create policy "admins manage roles" on public.user_roles
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read visible profiles" on public.profiles
for select using (is_directory_visible or id = auth.uid() or public.is_admin());

create policy "members update own profile" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "admins manage profiles" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read own membership" on public.memberships
for select using (profile_id = auth.uid() or public.is_admin());

create policy "admins manage memberships" on public.memberships
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read published events" on public.events
for select using (status <> 'draft' or public.is_admin());

create policy "admins manage events" on public.events
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read event inclusions" on public.event_inclusions
for select using (exists (select 1 from public.events e where e.id = event_id and e.status <> 'draft') or public.is_admin());

create policy "admins manage event inclusions" on public.event_inclusions
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read event itinerary" on public.event_itinerary_items
for select using (exists (select 1 from public.events e where e.id = event_id and e.status <> 'draft') or public.is_admin());

create policy "admins manage event itinerary" on public.event_itinerary_items
for all using (public.is_admin()) with check (public.is_admin());

create policy "members manage own event requests" on public.event_requests
for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());

create policy "members read concierge services" on public.concierge_services
for select using (is_active or public.is_admin());

create policy "admins manage concierge services" on public.concierge_services
for all using (public.is_admin()) with check (public.is_admin());

create policy "members manage own concierge requests" on public.concierge_requests
for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());

create policy "members read active perks" on public.perks
for select using (is_active or public.is_admin());

create policy "admins manage perks" on public.perks
for all using (public.is_admin()) with check (public.is_admin());

create policy "members manage own perk requests" on public.perk_requests
for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());

create policy "members read published announcements" on public.announcements
for select using (is_published or public.is_admin());

create policy "admins manage announcements" on public.announcements
for all using (public.is_admin()) with check (public.is_admin());

create policy "members read published newsletters" on public.newsletters
for select using (status = 'published' or public.is_admin());

create policy "admins manage newsletters" on public.newsletters
for all using (public.is_admin()) with check (public.is_admin());

create policy "members manage own referrals" on public.referrals
for all using (referrer_profile_id = auth.uid() or public.is_admin()) with check (referrer_profile_id = auth.uid() or public.is_admin());

create policy "admins manage admin notes" on public.admin_notes
for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('profile-photos', 'profile-photos', true),
  ('event-images', 'event-images', true),
  ('newsletter-images', 'newsletter-images', true)
on conflict (id) do nothing;
