-- Atomic random club assignment (= enrolment). Called ONLY by the backend with the secret key.
-- Errors are stable codes in the exception message; the backend maps them to API error codes:
--   TOURNAMENT_NOT_FOUND, TOURNAMENT_NOT_DRAFT, USER_NOT_FOUND, TOURNAMENT_FULL,
--   NO_FREE_CLUBS, ASSIGNMENT_RETRIES_EXHAUSTED
--
-- SECURITY INVOKER (default) on purpose: the function needs no extra power, because the caller
-- (service_role) already bypasses RLS. Less privilege = less to defend.

create or replace function public.assign_random_club(p_tournament uuid, p_user uuid)
returns public.tournament_participants
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_row public.tournament_participants%rowtype;
  v_club uuid;
  v_constraint text;
begin
  -- Row lock: serialises every enrolment (and any start) of this tournament.
  -- It makes "count < max" and "status = DRAFT" checks race-free.
  select * into v_tournament from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  -- Idempotent: already enrolled -> return the existing assignment.
  select * into v_row
  from public.tournament_participants
  where tournament_id = p_tournament and user_id = p_user;
  if found then
    return v_row;
  end if;

  if v_tournament.status <> 'DRAFT' then
    raise exception 'TOURNAMENT_NOT_DRAFT';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'USER_NOT_FOUND';
  end if;

  if (select count(*) from public.tournament_participants where tournament_id = p_tournament)
       >= v_tournament.max_participants then
    raise exception 'TOURNAMENT_FULL';
  end if;

  for attempt in 1..5 loop
    select c.id into v_club
    from public.clubs c
    where not exists (
      select 1 from public.tournament_participants tp
      where tp.tournament_id = p_tournament and tp.club_id = c.id
    )
    order by random()
    limit 1;

    if v_club is null then
      raise exception 'NO_FREE_CLUBS';
    end if;

    begin
      insert into public.tournament_participants (tournament_id, user_id, club_id)
      values (p_tournament, p_user, v_club)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'tournament_participants_user_unique' then
        select * into v_row
        from public.tournament_participants
        where tournament_id = p_tournament and user_id = p_user;
        return v_row;
      end if;
      -- Club taken by someone else between SELECT and INSERT: pick another one.
    end;
  end loop;

  raise exception 'ASSIGNMENT_RETRIES_EXHAUSTED';
end;
$$;

revoke execute on function public.assign_random_club(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_random_club(uuid, uuid) to service_role;
