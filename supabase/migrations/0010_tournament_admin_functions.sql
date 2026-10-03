-- Multi-row admin operations that must be atomic. Called ONLY by the backend with the secret key.
-- The backend validates first (admin role, status, counts) and gives friendly errors; these functions
-- re-check the same rules under a row lock so two racing requests cannot both succeed.
-- Errors are stable codes in the exception message, mapped by the backend:
--   start_tournament: TOURNAMENT_NOT_DRAFT, PARTICIPANTS_CHANGED
--   activate_round:   ROUND_CHANGED, ROUND_NOT_CLOSED
-- SECURITY INVOKER (default): the caller (service_role) already bypasses RLS, so no extra power is needed.

-- p_fixtures: [{"round": 1, "leg": 1, "home": "<participant uuid>", "away": "<participant uuid>"}, ...]
create or replace function public.start_tournament(p_tournament uuid, p_fixtures jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_enrolled integer;
  v_in_fixtures integer;
begin
  -- Same row lock as assign_random_club: nobody can enrol while we start, and vice versa.
  update public.tournaments
     set status = 'ACTIVE', started_at = now(), current_round = 0
   where id = p_tournament and status = 'DRAFT';
  if not found then
    raise exception 'TOURNAMENT_NOT_DRAFT';
  end if;

  -- The calendar was built from a list read before this call; if someone enrolled in between, abort.
  select count(*) into v_enrolled from public.tournament_participants where tournament_id = p_tournament;
  select count(distinct pid) into v_in_fixtures
  from (
    select (f ->> 'home')::uuid as pid from jsonb_array_elements(p_fixtures) f
    union all
    select (f ->> 'away')::uuid from jsonb_array_elements(p_fixtures) f
  ) s;
  if v_enrolled <> v_in_fixtures then
    raise exception 'PARTICIPANTS_CHANGED';
  end if;

  insert into public.matches (tournament_id, round, leg, home_participant_id, away_participant_id)
  select p_tournament, (f ->> 'round')::int, (f ->> 'leg')::int, (f ->> 'home')::uuid, (f ->> 'away')::uuid
  from jsonb_array_elements(p_fixtures) f;
end;
$$;

-- Moves the tournament from round p_expected_round to the next one and turns that round's matches ACTIVE.
-- Returns the new round number.
create or replace function public.activate_round(p_tournament uuid, p_expected_round integer)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_next integer := p_expected_round + 1;
begin
  -- Conditional update: only the request that still sees the round it expected wins.
  update public.tournaments
     set current_round = v_next
   where id = p_tournament and status = 'ACTIVE' and current_round = p_expected_round;
  if not found then
    raise exception 'ROUND_CHANGED';
  end if;

  if exists (
    select 1 from public.matches
    where tournament_id = p_tournament and round = p_expected_round
      and status not in ('CONFIRMED', 'RESOLVED')
  ) then
    raise exception 'ROUND_NOT_CLOSED';  -- rolls back the update above
  end if;

  update public.matches
     set status = 'ACTIVE'
   where tournament_id = p_tournament and round = v_next and status = 'SCHEDULED';

  return v_next;
end;
$$;

revoke execute on function public.start_tournament(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_tournament(uuid, jsonb) to service_role;
revoke execute on function public.activate_round(uuid, integer) from public, anon, authenticated;
grant execute on function public.activate_round(uuid, integer) to service_role;
