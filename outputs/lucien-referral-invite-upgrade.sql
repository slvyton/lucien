-- LUCIEN referral invite upgrade
-- Adds referral-link submission and acceptance tracking.

create extension if not exists "pgcrypto";

alter table public.referrals
add column if not exists referral_code text,
add column if not exists candidate_phone text,
add column if not exists source text not null default 'member_portal',
add column if not exists accepted_at timestamptz,
add column if not exists declined_at timestamptz,
add column if not exists credited_at timestamptz;

create unique index if not exists memberships_referral_code_unique
on public.memberships (referral_code)
where referral_code is not null;

update public.memberships
set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

alter table public.memberships
alter column referral_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create or replace function public.submit_referral_application(
  referral_code_input text,
  candidate_name_input text,
  candidate_email_input text,
  note_input text default null,
  candidate_phone_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer uuid;
  remaining integer;
  referral_id uuid;
begin
  select profile_id, invitations_remaining
  into referrer, remaining
  from public.memberships
  where lower(referral_code) = lower(trim(referral_code_input))
    and status = 'active'
  limit 1;

  if referrer is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid referral link.');
  end if;

  if coalesce(remaining, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'This member has no invitations remaining.');
  end if;

  insert into public.referrals (
    referrer_profile_id,
    candidate_name,
    candidate_email,
    candidate_phone,
    note,
    status,
    referral_code,
    source
  ) values (
    referrer,
    nullif(trim(candidate_name_input), ''),
    nullif(trim(candidate_email_input), ''),
    nullif(trim(candidate_phone_input), ''),
    nullif(trim(note_input), ''),
    'new',
    upper(trim(referral_code_input)),
    'referral_link'
  )
  returning id into referral_id;

  return jsonb_build_object('ok', true, 'id', referral_id);
end;
$$;

grant execute on function public.submit_referral_application(text, text, text, text, text) to anon, authenticated;
