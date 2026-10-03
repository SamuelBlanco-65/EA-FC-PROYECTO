-- The six "card" stats of EA FC (PAC, SHO, PAS, DRI, DEF, PHY), as scraped from the club pages.
-- For goalkeepers the source reuses the same six slots with other meanings:
--   pace = diving, shooting = handling, passing = kicking, dribbling = reflexes,
--   defending = speed, physical = positioning.
-- The app must show goalkeeper labels when position = 'GK'. NULL = the source did not provide it.
alter table public.players
  add column if not exists pace smallint check (pace between 1 and 99),
  add column if not exists shooting smallint check (shooting between 1 and 99),
  add column if not exists passing smallint check (passing between 1 and 99),
  add column if not exists dribbling smallint check (dribbling between 1 and 99),
  add column if not exists defending smallint check (defending between 1 and 99),
  add column if not exists physical smallint check (physical between 1 and 99);
