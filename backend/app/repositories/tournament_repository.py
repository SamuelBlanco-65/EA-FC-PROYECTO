"""Reads tournament, standings and matches.

Client used: the USER'S JWT (RLS: authenticated users may SELECT these tables and the `standings`
view, which is `security_invoker`). Nothing here needs the secret key.
"""
from datetime import datetime
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.config import Settings
from app.core.supabase_clients import user_postgrest
from app.domain.tournament import ClubRef, Match, MatchStatus, StandingRow, Tournament, TournamentStatus
from app.repositories._postgrest import upstream_error


class TournamentRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_current(self, access_token: str) -> Tournament | None:
        """The MVP runs a single tournament: the most recently created one."""
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("tournaments")
                .select("id,name,status,current_round,max_participants,started_at,tournament_participants(count)")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el torneo") from None
        if not rows:
            return None
        r = rows[0]
        return Tournament(
            id=UUID(r["id"]),
            name=r["name"],
            status=TournamentStatus(r["status"]),
            current_round=r["current_round"],
            max_participants=r["max_participants"],
            participant_count=r["tournament_participants"][0]["count"],
            started_at=datetime.fromisoformat(r["started_at"]) if r["started_at"] else None,
        )

    def get_standings(self, tournament_id: UUID, access_token: str) -> list[StandingRow]:
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("standings")
                .select(
                    "position,participant_id,club_id,club_name,club_short_name,played,won,drawn,lost,"
                    "goals_for,goals_against,goal_difference,points"
                )
                .eq("tournament_id", str(tournament_id))
                .order("position")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "la clasificación") from None
        return [
            StandingRow(
                **{k: r[k] for k in (
                    "position", "club_name", "club_short_name", "played", "won", "drawn", "lost",
                    "goals_for", "goals_against", "goal_difference", "points")},
                participant_id=UUID(r["participant_id"]),
                club_id=UUID(r["club_id"]),
            )
            for r in rows
        ]

    def get_matches(self, tournament_id: UUID, clubs: dict[UUID, ClubRef], access_token: str) -> list[Match]:
        """`clubs` maps participant id -> club, so the DTO can show names without a second round trip per match."""
        try:
            rows = (
                user_postgrest(self._settings, access_token)
                .from_("matches")
                .select("id,round,leg,status,home_participant_id,away_participant_id,home_score,away_score")
                .eq("tournament_id", str(tournament_id))
                .order("round")
                .order("leg")
                .order("created_at")
                .execute()
                .data
            )
        except APIError as exc:
            raise upstream_error(exc, "el calendario") from None
        return [
            Match(
                id=UUID(r["id"]),
                round=r["round"],
                leg=r["leg"],
                status=MatchStatus(r["status"]),
                home=clubs[UUID(r["home_participant_id"])],
                away=clubs[UUID(r["away_participant_id"])],
                home_score=r["home_score"],
                away_score=r["away_score"],
            )
            for r in rows
        ]
