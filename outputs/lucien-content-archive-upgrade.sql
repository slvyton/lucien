-- LUCIEN content archive upgrade
-- Adds reversible archive markers for admin-managed content.

alter table public.announcements
add column if not exists archived_at timestamptz;

alter table public.newsletters
add column if not exists archived_at timestamptz;

alter table public.perks
add column if not exists archived_at timestamptz;

alter table public.concierge_services
add column if not exists archived_at timestamptz;
