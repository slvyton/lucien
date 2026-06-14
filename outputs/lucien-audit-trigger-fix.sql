-- LUCIEN audit trigger fix
-- Repairs profile saves when the shared audit trigger runs on public.profiles.

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
