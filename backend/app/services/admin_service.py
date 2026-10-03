"""Tournament-level admin operations (the router already requires the admin role)."""
import random
from dataclasses import dataclass

from app.core.errors import AppError
from app.domain.match_state import round_is_closed
from app.domain.round_robin import generate_fixtures
from app.domain.tournament import AdminParticipant, Tournament, TournamentStatus
from app.domain.user import CurrentUser
from app.repositories.match_repository import MatchRepository
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.tournament_repository import TournamentRepository
from app.services.common import current_tournament

MIN_PARTICIPANTS = 2


@dataclass(frozen=True)
class StartResult:
    tournament: Tournament
    participant_count: int
    round_count: int
    match_count: int


@dataclass(frozen=True)
class ActivationResult:
    current_round: int
    activated_matches: int


class AdminService:
    def __init__(
        self, tournaments: TournamentRepository, participants: ParticipantRepository, matches: MatchRepository
    ) -> None:
        self._tournaments = tournaments
        self._participants = participants
        self._matches = matches

    def start_tournament(self, admin: CurrentUser) -> StartResult:
        tournament = current_tournament(self._tournaments, admin)
        if tournament.status is not TournamentStatus.DRAFT:
            raise AppError("TOURNAMENT_ALREADY_STARTED", "El torneo ya inició.", 409)
        participant_ids = list(self._participants.club_refs(tournament.id, admin.access_token))
        if len(participant_ids) < MIN_PARTICIPANTS:
            raise AppError(
                "NOT_ENOUGH_PARTICIPANTS", f"Se necesitan al menos {MIN_PARTICIPANTS} participantes.", 409,
                {"participants": len(participant_ids), "min": MIN_PARTICIPANTS},
            )
        # Shuffled once: the circle method is deterministic, so this is what makes the calendar random.
        random.SystemRandom().shuffle(participant_ids)
        fixtures = generate_fixtures(participant_ids)
        self._tournaments.start(tournament.id, fixtures)
        started = current_tournament(self._tournaments, admin)
        return StartResult(
            tournament=started,
            participant_count=len(participant_ids),
            round_count=max(f.round for f in fixtures),
            match_count=len(fixtures),
        )

    def activate_next_round(self, admin: CurrentUser) -> ActivationResult:
        tournament = current_tournament(self._tournaments, admin)
        if tournament.status is not TournamentStatus.ACTIVE:
            raise AppError("TOURNAMENT_NOT_ACTIVE", "El torneo no está en curso.", 409, {"status": tournament.status})
        matches = self._matches.list_for_tournament(tournament.id, admin.access_token)
        last_round = max((m.round for m in matches), default=0)
        current = tournament.current_round
        if current >= last_round:
            raise AppError("NO_MORE_ROUNDS", "No quedan fechas por activar.", 409, {"lastRound": last_round})
        open_matches = [m for m in matches if m.round == current and not round_is_closed([m.status])]
        if open_matches:
            raise AppError(
                "ROUND_NOT_CLOSED",
                "Todos los partidos de la fecha actual deben estar confirmados o resueltos.",
                409,
                {"round": current, "openMatches": len(open_matches)},
            )
        new_round = self._tournaments.activate_round(tournament.id, current)
        return ActivationResult(new_round, sum(1 for m in matches if m.round == new_round))

    def participants(self, admin: CurrentUser) -> list[AdminParticipant]:
        tournament = current_tournament(self._tournaments, admin)
        return self._participants.list_for_admin(tournament.id)
