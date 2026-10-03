"""Business rules around reading the tournament and enrolling.

Layers: the router parses the request, this service decides, repositories talk to Supabase.
"""
from app.core.errors import AppError
from app.domain.tournament import Assignment, Match, StandingRow, Tournament
from app.domain.user import CurrentUser
from app.repositories.club_repository import ClubRepository
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.tournament_repository import TournamentRepository


class TournamentService:
    def __init__(
        self,
        tournaments: TournamentRepository,
        participants: ParticipantRepository,
        clubs: ClubRepository,
    ) -> None:
        self._tournaments = tournaments
        self._participants = participants
        self._clubs = clubs

    def current(self, user: CurrentUser) -> Tournament:
        tournament = self._tournaments.get_current(user.access_token)
        if tournament is None:
            raise AppError("TOURNAMENT_NOT_FOUND", "No hay un torneo disponible.", 404)
        return tournament

    def standings(self, user: CurrentUser) -> list[StandingRow]:
        tournament = self.current(user)
        return self._tournaments.get_standings(tournament.id, user.access_token)

    def fixtures(self, user: CurrentUser) -> list[Match]:
        tournament = self.current(user)
        refs = self._participants.club_refs(tournament.id, user.access_token)
        return self._tournaments.get_matches(tournament.id, refs, user.access_token)

    def assign_club(self, user: CurrentUser) -> Assignment:
        """Idempotent. The club is chosen by the SQL function, never by the client."""
        tournament = self.current(user)
        existing = self._participants.find_own(tournament.id, user.id, user.access_token)
        # Benign race: two simultaneous first calls of the same user both report False. The SQL
        # function still returns one single row for both, so the data stays correct.
        participant = existing or self._participants.assign_random_club(tournament.id, user.id)
        pool = self._clubs.list_all(user.access_token)
        club = next((c for c in pool if c.id == participant.club_id), None)
        if club is None:
            raise AppError("UPSTREAM_ERROR", "No se pudo leer el club asignado.", 502)
        return Assignment(participant=participant, club=club, clubs=pool, already_assigned=existing is not None)
