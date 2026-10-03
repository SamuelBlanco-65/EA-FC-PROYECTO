-- Enumerated types. Values are closed business rules (see CLAUDE.md).

create type public.user_role as enum ('participant', 'admin');

create type public.tournament_status as enum ('DRAFT', 'ACTIVE', 'FINISHED');

create type public.match_status as enum (
  'SCHEDULED',
  'ACTIVE',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'DISPUTED',
  'RESOLVED'
);

create type public.event_type as enum ('GOAL', 'YELLOW', 'RED');
