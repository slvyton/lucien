-- LUCIEN functionality upgrade
-- Adds storage policies, newsletter delivery tracking, stricter admin checks, and member audit logs.

create extension if not exists "pgcrypto";

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_owner_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  status text not null default 'queued',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.newsletter_deliveries enable row level security;

drop policy if exists "admins read newsletter deliveries" on public.newsletter_deliveries;
create policy "admins read newsletter deliveries" on public.newsletter_deliveries
for select using (public.is_owner_admin());

drop policy if exists "admins manage newsletter deliveries" on public.newsletter_deliveries;
create policy "admins manage newsletter deliveries" on public.newsletter_deliveries
for all using (public.is_owner_admin()) with check (public.is_owner_admin());

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  subject_type text not null,
  subject_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs
for select using (public.is_owner_admin());

create or replace function public.changed_jsonb_keys(old_row jsonb, new_row jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(key order by key), '{}')
  from (
    select key
    from jsonb_object_keys(old_row || new_row) as key
    where old_row -> key is distinct from new_row -> key
  ) changed;
$$;

create or replace function public.audit_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_doc jsonb;
  new_doc jsonb;
  changed text[];
  subject uuid;
begin
  old_doc := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_doc := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  changed := case
    when tg_op = 'UPDATE' then public.changed_jsonb_keys(old_doc, new_doc)
    else '{}'
  end;

  if tg_op = 'UPDATE' and coalesce(array_length(changed, 1), 0) = 0 then
    return new;
  end if;

  if tg_table_name = 'memberships' then
    subject := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
  else
    subject := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  insert into public.audit_logs (
    actor_id,
    subject_type,
    subject_id,
    action,
    old_data,
    new_data,
    changed_fields
  ) values (
    auth.uid(),
    tg_table_name,
    subject,
    lower(tg_op),
    old_doc,
    new_doc,
    changed
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists profiles_audit_member_change on public.profiles;
create trigger profiles_audit_member_change
after insert or update or delete on public.profiles
for each row execute function public.audit_member_change();

drop trigger if exists memberships_audit_member_change on public.memberships;
create trigger memberships_audit_member_change
after insert or update or delete on public.memberships
for each row execute function public.audit_member_change();

insert into storage.buckets (id, name, public)
values
  ('profile-photos', 'profile-photos', true),
  ('event-images', 'event-images', true),
  ('newsletter-images', 'newsletter-images', true)
on conflict (id) do nothing;

drop policy if exists "members upload own profile photo" on storage.objects;
create policy "members upload own profile photo" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "members update own profile photo" on storage.objects;
create policy "members update own profile photo" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "admins manage event images" on storage.objects;
create policy "admins manage event images" on storage.objects
for all to authenticated
using (bucket_id = 'event-images' and public.is_owner_admin())
with check (bucket_id = 'event-images' and public.is_owner_admin());

drop policy if exists "admins manage newsletter images" on storage.objects;
create policy "admins manage newsletter images" on storage.objects
for all to authenticated
using (bucket_id = 'newsletter-images' and public.is_owner_admin())
with check (bucket_id = 'newsletter-images' and public.is_owner_admin());

drop policy if exists "public reads lucien public images" on storage.objects;
create policy "public reads lucien public images" on storage.objects
for select
using (bucket_id in ('profile-photos', 'event-images', 'newsletter-images'));
