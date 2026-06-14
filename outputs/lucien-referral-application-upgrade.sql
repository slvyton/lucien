-- LUCIEN referral application upgrade
-- Stores referral application details in structured fields before Stripe is connected.

alter table public.referrals
add column if not exists candidate_city text,
add column if not exists candidate_profession_company text,
add column if not exists selected_tier text,
add column if not exists quarterly_price numeric(10,2),
add column if not exists payment_status text not null default 'pending',
add column if not exists application_payload jsonb not null default '{}'::jsonb;

create or replace function public.submit_referral_application(
  referral_code_input text,
  candidate_name_input text,
  candidate_email_input text,
  note_input text default null,
  candidate_phone_input text default null,
  candidate_city_input text default null,
  candidate_profession_company_input text default null,
  selected_tier_input text default null,
  quarterly_price_input numeric default null,
  payment_status_input text default 'pending',
  application_payload_input jsonb default '{}'::jsonb
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
    candidate_city,
    candidate_profession_company,
    selected_tier,
    quarterly_price,
    payment_status,
    application_payload,
    note,
    status,
    referral_code,
    source
  ) values (
    referrer,
    nullif(trim(candidate_name_input), ''),
    nullif(trim(candidate_email_input), ''),
    nullif(trim(candidate_phone_input), ''),
    nullif(trim(candidate_city_input), ''),
    nullif(trim(candidate_profession_company_input), ''),
    nullif(trim(selected_tier_input), ''),
    quarterly_price_input,
    coalesce(nullif(trim(payment_status_input), ''), 'pending'),
    coalesce(application_payload_input, '{}'::jsonb),
    nullif(trim(note_input), ''),
    'new',
    upper(trim(referral_code_input)),
    'referral_link'
  )
  returning id into referral_id;

  return jsonb_build_object('ok', true, 'id', referral_id);
end;
$$;

grant execute on function public.submit_referral_application(
  text, text, text, text, text, text, text, text, numeric, text, jsonb
) to anon, authenticated;
