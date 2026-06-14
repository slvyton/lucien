-- LUCIEN member event submission helper
-- Member events auto-confirm when capacity allows. Retreats remain approval-based requests.
-- Run after lucien-event-request-workflow.sql.

create or replace function public.submit_event_request(
  event_slug text,
  request_type text,
  party_size integer default 1,
  guest_names text default null,
  intention text default null,
  dietary_access_notes text default null,
  arrival_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.events%rowtype;
  request_row public.event_requests%rowtype;
  attendee_row public.event_attendees%rowtype;
  requested_party integer;
  confirmed_party integer;
  should_auto_confirm boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  requested_party := greatest(coalesce(party_size, 1), 1);

  select *
  into event_row
  from public.events
  where slug = event_slug;

  if not found then
    raise exception 'Event not found';
  end if;

  select coalesce(sum(greatest(a.party_size, 1)), 0)::integer
  into confirmed_party
  from public.event_attendees a
  where a.event_id = event_row.id
    and a.status in ('confirmed', 'attended');

  should_auto_confirm :=
    event_row.kind = 'member_event'
    and event_row.status = 'open'
    and (
      event_row.capacity is null
      or confirmed_party + requested_party <= event_row.capacity
    );

  insert into public.event_requests (
    event_id,
    profile_id,
    request_type,
    party_size,
    guest_names,
    intention,
    dietary_access_notes,
    arrival_notes,
    status
  ) values (
    event_row.id,
    auth.uid(),
    request_type,
    requested_party,
    nullif(guest_names, ''),
    nullif(intention, ''),
    nullif(dietary_access_notes, ''),
    nullif(arrival_notes, ''),
    case when should_auto_confirm then 'approved'::public.request_status else 'new'::public.request_status end
  )
  returning * into request_row;

  if should_auto_confirm then
    insert into public.event_attendees (
      event_id,
      profile_id,
      event_request_id,
      status,
      party_size,
      guest_names,
      notes,
      approved_at
    ) values (
      event_row.id,
      auth.uid(),
      request_row.id,
      'confirmed',
      requested_party,
      nullif(guest_names, ''),
      nullif(dietary_access_notes, ''),
      now()
    )
    on conflict (event_id, profile_id) do update
      set status = 'confirmed',
          event_request_id = excluded.event_request_id,
          party_size = excluded.party_size,
          guest_names = excluded.guest_names,
          notes = excluded.notes,
          approved_at = coalesce(public.event_attendees.approved_at, now())
    returning * into attendee_row;
  end if;

  return jsonb_build_object(
    'request_id', request_row.id,
    'request_status', request_row.status,
    'attendance_status', attendee_row.status,
    'auto_confirmed', should_auto_confirm
  );
end;
$$;

grant execute on function public.submit_event_request(text, text, integer, text, text, text, text) to authenticated;
