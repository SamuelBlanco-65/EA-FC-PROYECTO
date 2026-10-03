-- League table derived from matches. Never maintained by hand.
-- Only CONFIRMED / RESOLVED matches count. 3/1/0 points.
-- Order: points, goal difference, goals for, club name. `position` encodes that order.
-- security_invoker: the view runs with the caller's privileges, so RLS of the base tables applies.
-- (ORDER BY on a view is not guaranteed to survive, so consumers should ORDER BY position.)

create view public.standings
with (security_invoker = true) as
with played as (
  select tournament_id, home_participant_id as participant_id,
         home_score as goals_for, away_score as goals_against
  from public.matches
  where status in ('CONFIRMED', 'RESOLVED')
  union all
  select tournament_id, away_participant_id as participant_id,
         away_score as goals_for, home_score as goals_against
  from public.matches
  where status in ('CONFIRMED', 'RESOLVED')
),
agg as (
  select
    participant_id,
    count(*)::int as played,
    (count(*) filter (where goals_for > goals_against))::int as won,
    (count(*) filter (where goals_for = goals_against))::int as drawn,
    (count(*) filter (where goals_for < goals_against))::int as lost,
    sum(goals_for)::int as goals_for,
    sum(goals_against)::int as goals_against
  from played
  group by participant_id
),
table_rows as (
  select
    tp.tournament_id,
    tp.id as participant_id,
    c.id as club_id,
    c.name as club_name,
    c.short_name as club_short_name,
    coalesce(a.played, 0) as played,
    coalesce(a.won, 0) as won,
    coalesce(a.drawn, 0) as drawn,
    coalesce(a.lost, 0) as lost,
    coalesce(a.goals_for, 0) as goals_for,
    coalesce(a.goals_against, 0) as goals_against,
    coalesce(a.goals_for, 0) - coalesce(a.goals_against, 0) as goal_difference,
    coalesce(a.won, 0) * 3 + coalesce(a.drawn, 0) as points
  from public.tournament_participants tp
  join public.clubs c on c.id = tp.club_id
  left join agg a on a.participant_id = tp.id
)
select
  r.*,
  (row_number() over (
    partition by r.tournament_id
    order by r.points desc, r.goal_difference desc, r.goals_for desc, r.club_name asc
  ))::int as position
from table_rows r;
