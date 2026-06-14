-- LUCIEN seed verification
-- Run in Supabase SQL Editor after lucien-seed-content.sql.

select 'events' as table_name, count(*) as rows from public.events
union all
select 'event_inclusions', count(*) from public.event_inclusions
union all
select 'event_itinerary_items', count(*) from public.event_itinerary_items
union all
select 'concierge_services', count(*) from public.concierge_services
union all
select 'perks', count(*) from public.perks
union all
select 'announcements', count(*) from public.announcements
order by table_name;

select
  slug,
  kind,
  title,
  status,
  price_label,
  cta_label
from public.events
order by sort_order;
