-- LUCIEN member invite upgrade
-- Tracks direct admin invitations sent to member profiles.

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  status text not null default 'sent',
  provider_message_id text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  error_message text
);

alter table public.member_invites enable row level security;

drop policy if exists "admins read member invites" on public.member_invites;
create policy "admins read member invites" on public.member_invites
for select using (public.is_admin());

drop policy if exists "admins manage member invites" on public.member_invites;
create policy "admins manage member invites" on public.member_invites
for all using (public.is_admin()) with check (public.is_admin());
