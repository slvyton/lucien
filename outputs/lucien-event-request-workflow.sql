-- LUCIEN event request workflow
-- Adds confirmed attendance records and keeps event confirmed counts in sync.

create table if not exists public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_request_id uuid references public.event_requests(id) on delete set null,
  status text not null default 'confirmed',
  party_size integer not null default 1,
  guest_names text,
  notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

alter table public.event_attendees enable row level security;

drop policy if exists "members read own event attendance" on public.event_attendees;
create policy "members read own event attendance" on public.event_attendees
for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "admins manage event attendance" on public.event_attendees;
create policy "admins manage event attendance" on public.event_attendees
for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists event_attendees_touch_updated_at on public.event_attendees;
create trigger event_attendees_touch_updated_at before update on public.event_attendees
for each row execute function public.touch_updated_at();

create or replace function public.refresh_event_confirmed_count(target_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events
  set confirmed_count = (
    select coalesce(sum(greatest(party_size, 1)), 0)::integer
    from public.event_attendees
    where event_id = target_event_id
      and status in ('confirmed', 'attended')
  )
  where id = target_event_id;
$$;

create or replace function public.sync_event_confirmed_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_event_confirmed_count(new.event_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.refresh_event_confirmed_count(new.event_id);
    if old.event_id is distinct from new.event_id then
      perform public.refresh_event_confirmed_count(old.event_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_event_confirmed_count(old.event_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists event_attendees_sync_confirmed_count on public.event_attendees;
create trigger event_attendees_sync_confirmed_count
after insert or update or delete on public.event_attendees
for each row execute function public.sync_event_confirmed_count();
