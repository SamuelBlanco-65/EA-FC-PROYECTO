-- Row Level Security on every table + least-privilege grants.
-- Two layers: GRANTs decide which operations a role may attempt at all; RLS policies decide
-- which rows. The secret key (service_role) bypasses RLS and keeps its default grants.
-- No policy and no grant exists for `anon`.

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.players enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.lineups enable row level security;

-- Start from zero: Supabase grants ALL to anon/authenticated by default on new tables.
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.clubs, public.players, public.tournaments, public.tournament_participants,
  public.matches, public.match_events, public.standings
to authenticated;

-- profiles: read own row; edit ONLY display_name (column-level grant keeps `role` immutable).
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant insert on public.match_events to authenticated;
grant select, insert, update, delete on public.lineups to authenticated;

-- Read-only reference/game data for any signed-in user.
create policy clubs_select on public.clubs
  for select to authenticated using (true);
create policy players_select on public.players
  for select to authenticated using (true);
create policy tournaments_select on public.tournaments
  for select to authenticated using (true);
create policy tournament_participants_select on public.tournament_participants
  for select to authenticated using (true);
create policy matches_select on public.matches
  for select to authenticated using (true);
create policy match_events_select on public.match_events
  for select to authenticated using (true);

-- profiles: each user sees and edits only their own row.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- match_events INSERT (defence in depth, the backend validates the same rules):
--  * the event is created by the caller;
--  * the participant is the caller's own;
--  * the match is ACTIVE and the participant plays in it;
--  * the player belongs to the participant's club.
-- No UPDATE/DELETE policy and no grant: events are immutable (mistakes go through disputes).
create policy match_events_insert_own_team on public.match_events
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.tournament_participants tp
      where tp.id = match_events.participant_id
        and tp.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.matches m
      where m.id = match_events.match_id
        and m.status = 'ACTIVE'
        and match_events.participant_id in (m.home_participant_id, m.away_participant_id)
    )
    and exists (
      select 1
      from public.players pl
      join public.tournament_participants tp on tp.club_id = pl.club_id
      where pl.id = match_events.player_id
        and tp.id = match_events.participant_id
    )
  );

-- lineups: only the owner of the participant row.
create policy lineups_select_own on public.lineups
  for select to authenticated
  using (exists (
    select 1 from public.tournament_participants tp
    where tp.id = lineups.participant_id and tp.user_id = (select auth.uid())
  ));
create policy lineups_insert_own on public.lineups
  for insert to authenticated
  with check (exists (
    select 1 from public.tournament_participants tp
    where tp.id = lineups.participant_id and tp.user_id = (select auth.uid())
  ));
create policy lineups_update_own on public.lineups
  for update to authenticated
  using (exists (
    select 1 from public.tournament_participants tp
    where tp.id = lineups.participant_id and tp.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.tournament_participants tp
    where tp.id = lineups.participant_id and tp.user_id = (select auth.uid())
  ));
create policy lineups_delete_own on public.lineups
  for delete to authenticated
  using (exists (
    select 1 from public.tournament_participants tp
    where tp.id = lineups.participant_id and tp.user_id = (select auth.uid())
  ));
