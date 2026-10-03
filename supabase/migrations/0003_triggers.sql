-- Profile creation on sign-up and lineups.updated_at maintenance.

-- SECURITY DEFINER because the trigger fires on auth.users, owned by another role.
-- search_path is emptied so nothing can be hijacked by a same-named object.
-- The role is NEVER read from user metadata (the client controls it): it always takes the
-- column default 'participant'. Admins are promoted only with the secret key / SQL.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Jugador'
      ),
      40
    )
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Users registered before this trigger existed.
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Jugador'
    ),
    40
  )
from auth.users u
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lineups_set_updated_at
before update on public.lineups
for each row execute function public.set_updated_at();
