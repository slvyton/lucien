create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all"
on public.app_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('owner', 'admin')
  )
);

drop policy if exists "app_settings_member_read" on public.app_settings;
create policy "app_settings_member_read"
on public.app_settings
for select
to authenticated
using (true);

insert into public.app_settings (key, value)
values (
  'member_hero',
  jsonb_build_object(
    'eyebrow', 'The Next Gathering',
    'count_label', 'Days Until',
    'target_date', '',
    'title', '',
    'subtitle', '',
    'season', 'auto'
  )
)
on conflict (key) do nothing;
