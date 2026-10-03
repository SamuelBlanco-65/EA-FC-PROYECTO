"""The caller's own squad and lineup. Everything is scoped to the participant found from the JWT."""
from app.core.errors import AppError
from app.domain.match import Lineup, LineupSlot, Player
from app.domain.user import CurrentUser
from app.repositories.lineup_repository import LineupRepository
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.player_repository import PlayerRepository
from app.repositories.tournament_repository import TournamentRepository
from app.services.common import current_tournament, own_participant

MAX_LINEUP_PLAYERS = 11


class SquadService:
    def __init__(
        self,
        tournaments: TournamentRepository,
        participants: ParticipantRepository,
        players: PlayerRepository,
        lineups: LineupRepository,
    ) -> None:
        self._tournaments = tournaments
        self._participants = participants
        self._players = players
        self._lineups = lineups

    def squad(self, user: CurrentUser) -> list[Player]:
        me = self._me(user)
        return self._players.list_by_club(me.club_id, user.access_token)

    def get_lineup(self, user: CurrentUser) -> Lineup:
        me = self._me(user)
        lineup = self._lineups.get(me.id, user.access_token)
        if lineup is None:
            raise AppError("LINEUP_NOT_FOUND", "Todavía no guardaste una alineación.", 404)
        return lineup

    def save_lineup(self, user: CurrentUser, formation: str, slots: list[LineupSlot]) -> Lineup:
        me = self._me(user)
        if len(slots) > MAX_LINEUP_PLAYERS:
            raise AppError("INVALID_LINEUP", f"Máximo {MAX_LINEUP_PLAYERS} jugadores.", 422)
        ids = [s.player_id for s in slots]
        if len(set(ids)) != len(ids):
            raise AppError("INVALID_LINEUP", "Un jugador no puede aparecer dos veces.", 422)
        club_players = {p.id for p in self._players.list_by_club(me.club_id, user.access_token)}
        if not set(ids) <= club_players:
            raise AppError("PLAYER_NOT_IN_CLUB", "Hay jugadores que no pertenecen a tu club.", 422)
        return self._lineups.upsert(me.id, formation, slots, user.access_token)

    def _me(self, user: CurrentUser):
        tournament = current_tournament(self._tournaments, user)
        return own_participant(self._participants, tournament.id, user)
