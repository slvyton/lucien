-- LUCIEN MVP seed content
-- Run after lucien-supabase-schema.sql.

insert into public.events (
  slug, kind, title, summary, description, date_label, start_date, location, venue,
  status, capacity, confirmed_count, price_label, dress_code, host_label, travel_note,
  cta_label, sort_order
) values
(
  'founders-invitational',
  'member_event',
  'The Founder''s Invitational',
  'LUCIEN''s flagship society gathering. Coastal golf, curated foursomes, sunset reception.',
  'LUCIEN''s flagship gathering and the year''s principal occasion for relationship-building. Days unfold along the coast - curated foursomes arranged by the concierge, an ocean-view cigar lounge, espresso martinis at the turn - and close with a sunset cocktail reception. This is hospitality first: cinematic, intentional, and socially elevated. Not a tournament. Not an outing. A society at ease.',
  'Late Summer 2026',
  '2026-09-01',
  'Newport Coast, California',
  'Pelican Hill - Coastal links',
  'open',
  100,
  38,
  null,
  'Tailored resortwear. Sunset reception attire for the evening.',
  'Hosted by the Founders',
  null,
  'RSVP',
  10
),
(
  'midnight-masquerade',
  'member_event',
  'Midnight Masquerade',
  'LUCIEN''s mythological black-tie evening. Masks, candlelight, jazz orchestra, hidden lounges.',
  'LUCIEN''s mythological black-tie evening and its most cinematic ritual. Masks at the door, candlelight throughout, a jazz orchestra giving way to something later and quieter. Velvet, champagne towers, art-deco lines, hidden lounges revealed only to those who wander. Old-Hollywood glamour with the discretion of a private society. The venue is disclosed to confirmed guests alone.',
  'Holiday Season 2026',
  '2026-12-12',
  'Los Angeles, California',
  'Secret venue - Revealed to confirmed guests',
  'open',
  150,
  64,
  null,
  'Black tie. Masks presented on arrival.',
  'Open to all members + select invited guests',
  null,
  'RSVP',
  20
),
(
  'maui-house',
  'retreat',
  'The Maui Beachfront Estate',
  'A luxurious beach retreat. Sunshine, daily yoga, ocean air, ukulele lessons, and easy social connection.',
  'A high-end social vacation for seven to eight members on a private oceanfront estate. Maui is the sunlit retreat: slow mornings, daily yoga, beach time, ocean air, and relaxed island activities like ukulele lessons woven throughout the stay. The schedule stays intentionally open, giving members free rein to relax, explore, and spend the island days their own way. Breakfast is included each morning, with semi-private transport arranged for arrival.',
  'October 2026',
  '2026-10-10',
  'Maui, Hawaii',
  'Private oceanfront estate',
  'invite_only',
  8,
  5,
  '$4,500 per person - $6,500 per couple sharing a room',
  'Barefoot luxury. Linen and ease.',
  '7-8 members - Solo members and couples welcomed - By invite request',
  'Members have free rein throughout the stay. A rental car is recommended for beach days, off-property plans, and exploring the island at your own pace.',
  'Request Invite',
  30
),
(
  'winter-house',
  'retreat',
  'Whistler Alpine House',
  'A luxurious alpine vacation. Ski-in/ski-out access, Whistler Blackcomb, fireside atmosphere, and social winter ease.',
  'A high-end social vacation for six to seven members in a private ski-in/ski-out chalet above Whistler. The rhythm is alpine and flexible: breakfast each morning, time on the mountain, warm social hours, and quiet luxury after dark. One day of Whistler Blackcomb lift tickets is included, with semi-private transport arranged for arrival. Outside the included ski day, members have free rein to shape the trip their way.',
  'January 2027',
  '2027-01-15',
  'Whistler, British Columbia',
  'Private alpine chalet',
  'invite_only',
  7,
  4,
  '$4,500 per person - $6,500 per couple sharing a room',
  'Alpine ease. Warm layers, one fireside evening.',
  '6-7 members - Solo members and couples welcomed - By invite request',
  'Members have free rein outside the included ski day. The chalet is ski-in/ski-out, with village plans and local movement best handled through the concierge or nearby transport.',
  'Request Invite',
  40
)
on conflict (slug) do update set
  kind = excluded.kind,
  title = excluded.title,
  summary = excluded.summary,
  description = excluded.description,
  date_label = excluded.date_label,
  start_date = excluded.start_date,
  location = excluded.location,
  venue = excluded.venue,
  status = excluded.status,
  capacity = excluded.capacity,
  confirmed_count = excluded.confirmed_count,
  price_label = excluded.price_label,
  dress_code = excluded.dress_code,
  host_label = excluded.host_label,
  travel_note = excluded.travel_note,
  cta_label = excluded.cta_label,
  sort_order = excluded.sort_order;

delete from public.event_inclusions
where event_id in (select id from public.events where slug in ('maui-house', 'winter-house'));

insert into public.event_inclusions (event_id, label, sort_order)
select e.id, v.label, v.sort_order
from public.events e
join (values
  ('maui-house', 'Daily breakfast', 10),
  ('maui-house', 'Semi-private arrival transport', 20),
  ('maui-house', 'Daily yoga', 30),
  ('maui-house', 'Beach and ocean activities', 40),
  ('maui-house', 'Ukulele lessons', 50),
  ('winter-house', 'Daily breakfast', 10),
  ('winter-house', 'Semi-private arrival transport', 20),
  ('winter-house', 'Ski-in/ski-out chalet', 30),
  ('winter-house', 'One day of Whistler Blackcomb lift tickets', 40),
  ('winter-house', 'Open alpine free time', 50)
) as v(slug, label, sort_order) on v.slug = e.slug;

delete from public.event_itinerary_items
where event_id in (select id from public.events where slug in ('founders-invitational', 'midnight-masquerade', 'maui-house', 'winter-house'));

insert into public.event_itinerary_items (event_id, day_label, detail, sort_order)
select e.id, v.day_label, v.detail, v.sort_order
from public.events e
join (values
  ('founders-invitational', 'Arrival', 'Welcome reception. Pairing preferences confirmed with your concierge.', 10),
  ('founders-invitational', 'Morning', 'Curated foursomes along the coastal links. Espresso martinis at the turn.', 20),
  ('founders-invitational', 'Afternoon', 'Ocean-view cigar lounge, spa, or open leisure.', 30),
  ('founders-invitational', 'Evening', 'Sunset cocktail reception. Concierge introductions throughout.', 40),
  ('midnight-masquerade', 'Arrival', 'Masks presented at the door. First pour on entry.', 10),
  ('midnight-masquerade', 'Early', 'Jazz orchestra. The principal rooms open.', 20),
  ('midnight-masquerade', 'Late', 'Orchestra gives way to DJ. Hidden lounges revealed.', 30),
  ('midnight-masquerade', 'Midnight', 'The unmasking, for those inclined.', 40),
  ('maui-house', 'Arrival', 'Semi-private transport meets members on arrival and brings the group to the estate.', 10),
  ('maui-house', 'Mornings', 'Breakfast included, followed by daily yoga, ocean swims, and open beach time.', 20),
  ('maui-house', 'Afternoon', 'Relaxed island activities, including ukulele lessons, sunshine, and unstructured leisure.', 30),
  ('maui-house', 'Free Time', 'Members are free to explore the island, make their own plans, or keep the pace completely relaxed. A rental car is recommended.', 40),
  ('winter-house', 'Arrival', 'Semi-private transport meets members on arrival and brings the group to the chalet.', 10),
  ('winter-house', 'Mornings', 'Breakfast included, then ski-in/ski-out access to the mountain.', 20),
  ('winter-house', 'Mountain', 'One day of Whistler Blackcomb lift tickets included.', 30),
  ('winter-house', 'Free Time', 'Members can make their own plans in the village, stay close to the chalet, or explore Whistler at their own pace.', 40)
) as v(slug, day_label, detail, sort_order) on v.slug = e.slug;

insert into public.concierge_services (slug, symbol, title, summary, description, form_label, prompt, sort_order, is_active)
values
('introduction', '->', 'Introduction Request', 'A warm introduction to another member, handled with full discretion.', 'Request a considered introduction to another member of the society. Your concierge reviews fit and timing before anything is extended, and nothing is shared without your consent. Discretion is absolute.', 'Request an Introduction', 'Whom would you like to meet, and to what end?', 10, true),
('reservation', '<>', 'Reservation & Access', 'Private dining, suites, and access not available to the public.', 'Private dining, hotel suites, and access arranged through the society''s standing relationships. Tables and rooms that do not exist for the public. Tell your concierge what you have in mind and it will be handled.', 'Request a Reservation', 'What would you like reserved - where, when, and for how many?', 20, true),
('partnership', '<>', 'Partnership Inquiry', 'A collaborator, co-investor, or creative partner within the society.', 'Seeking a collaborator, co-investor, or creative partner from within the membership. Your concierge routes the inquiry quietly to the appropriate parties and returns only with genuine interest.', 'Submit an Inquiry', 'Describe what you are building and the kind of partner you seek.', 30, true),
('event-assistance', '*', 'Event Assistance', 'Travel, logistics, and bespoke requests for all LUCIEN gatherings.', 'Travel, logistics, RSVP management, and bespoke requests surrounding any LUCIEN event or retreat. From private aviation to a particular bottle waiting on arrival - consider it arranged.', 'Request Assistance', 'Which gathering, and how may your concierge assist?', 40, true)
on conflict (slug) do update set
  symbol = excluded.symbol,
  title = excluded.title,
  summary = excluded.summary,
  description = excluded.description,
  form_label = excluded.form_label,
  prompt = excluded.prompt,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.perks (slug, category, name, offer, description, sort_order, is_active)
values
('rosewood', 'Hospitality', 'Rosewood Hotels', 'Complimentary suite upgrades and late checkout at all properties worldwide.', 'Standing arrangements across the Rosewood portfolio: complimentary suite upgrades subject to availability, guaranteed late checkout, and recognition as a LUCIEN member at every property worldwide. Requested and confirmed through your concierge.', 10, true),
('augusta', 'Golf', 'Augusta National', 'Introductions available for qualified members. A conversation, not a guarantee.', 'For qualified members, the society can facilitate an introduction toward a round at Augusta National. This is a conversation conducted with great care and discretion - never a transaction, never a guarantee.', 20, true),
('dining', 'Dining', 'Noma - Per Se - Eleven Madison', 'Priority reservations through your concierge. Tables that do not exist publicly.', 'Priority access to the world''s most sought tables, arranged through the society''s direct relationships with the houses. Dates the public will not find. Submit your preferred window and party size.', 30, true),
('wellness', 'Wellness', 'Canyon Ranch & SHA Wellness', 'Preferred rates and complimentary consultations at two of the world''s finest estates.', 'Preferred member rates and complimentary initial consultations at Canyon Ranch and SHA Wellness - two of the finest wellness estates in the world. A natural complement to the LUCIEN retreats.', 40, true),
('aviation', 'Aviation', 'Wheels Up', 'Preferential terms and priority booking for travel to society events.', 'Preferential membership terms and priority booking with Wheels Up, with coordinated lift to and from LUCIEN events and retreats handled by your concierge.', 50, true),
('wine', 'Wine', 'Petrus & DRC Allocation', 'Annual allocation access to Pomerol and Burgundy''s most coveted bottles.', 'By introduction only: annual allocation access to Petrus and Domaine de la Romanee-Conti - bottles released through relationships, not markets. Your interest is registered confidentially against the year''s allocation.', 60, true)
on conflict (slug) do update set
  category = excluded.category,
  name = excluded.name,
  offer = excluded.offer,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.announcements (title, body, published_at, is_published)
values
('Founder''s Invitational - Registration Open', 'Registration for the Founder''s Invitational at Pelican Hill is now open to all members. Pairing preferences are arranged through your concierge.', '2026-05-28 12:00:00+00', true),
('Maui Beachfront Estate - Invite Requests Reviewed', 'Invite requests for the October Maui Beachfront Estate retreat are under review. Seven to eight places only; confirmations follow privately.', '2026-05-20 12:00:00+00', true),
('Three New Members', 'The society welcomes three new members this quarter, each introduced by a standing member.', '2026-05-12 12:00:00+00', true);
