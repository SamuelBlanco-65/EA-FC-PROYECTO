"""Match rules: who may do what, in which state. Routers never decide any of this.

Every state change is "validate -> domain transition -> conditional UPDATE (WHERE status = <what we read>)".
If the UPDATE touches 0 rows another request moved the match first and the caller gets 409.
"""
from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import AppError
from app.domain.match import (
    MAX_MINUTE, MIN_MINUTE, EventType, MatchDetail, MatchEvent, MatchRecord, derive_score, is_valid_minute,
)
from app.domain.match_state import ACTOR_BY_ACTION, Action, Actor, InvalidTransition, Transition, transition
from app.domain.tournament import ClubRef, Match, MatchStatus, Participant, TournamentStatus
from app.domain.user import CurrentUser
from app.repositories.match_repository import MatchRepository
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.player_repository import PlayerRepository
from app.repositories.tournament_repository import TournamentRepository
from app.services.common import current_tournament, own_participant


class MatchService:
    def __init__(
        self,
        matches: MatchRepository,
        participants: ParticipantRepository,
        tournaments: TournamentRepository,
        players: PlayerRepository,
    ) -> None:
        self._matches = matches
        self._participants = participants
        self._tournaments = tournaments
        self._players = players

    # ---- reads -------------------------------------------------------------------------------

    def detail(self, user: CurrentUser, match_id: UUID) -> MatchDetail:
        match = self._load(user, match_id)
        return self._detail(user, match, self._matches.list_events(match.id, user.access_token))

    def list_for_admin(self, user: CurrentUser, status: MatchStatus | None) -> list[Match]:
        tournament = current_tournament(self._tournaments, user)
        refs = self._participants.club_refs(tournament.id, user.access_token)
        records = self._matches.list_for_tournament(tournament.id, user.access_token, status)
        return [
            Match(
                id=m.id, round=m.round, leg=m.leg, status=m.status,
                home=refs[m.home_participant_id], away=refs[m.away_participant_id],
                home_score=m.home_score, away_score=m.away_score,
            )
            for m in records
        ]

    # ---- participant actions ---------------------------------------------------------------------

    def record_event(
        self,
        user: CurrentUser,
        match_id: UUID,
        *,
        event_id: UUID,
        participant_id: UUID,
        player_id: UUID,
        type: EventType,
        minute: int,
    ) -> tuple[MatchEvent, bool]:
        """Returns (event, created). Re-sending the same event id returns the stored one with created=False."""
        match = self._load(user, match_id)
        me = own_participant(self._participants, match.tournament_id, user)
        if me.id not in (match.home_participant_id, match.away_participant_id):
            raise AppError("NOT_IN_MATCH", "No juegas en este partido.", 403)
        # The body names a participant only so a tampered request is DETECTED, not obeyed.
        if participant_id != me.id:
            raise AppError("NOT_YOUR_TEAM", "Solo puedes registrar eventos de tu propio equipo.", 403)
        if not is_valid_minute(minute):
            raise AppError(
                "INVALID_MINUTE", f"El minuto debe estar entre {MIN_MINUTE} y {MAX_MINUTE}.", 422,
                {"min": MIN_MINUTE, "max": MAX_MINUTE},
            )

        # Idempotency first: a replay must succeed even if the match has moved on since the original request.
        existing = self._matches.get_event(event_id, user.access_token)
        if existing is not None:
            return self._same_event_or_conflict(existing, match.id, me.id, player_id, type, minute), False

        player = self._players.get(player_id, user.access_token)
        if player is None or player.club_id != me.club_id:
            raise AppError("PLAYER_NOT_IN_CLUB", "El jugador no pertenece a tu club.", 422)
        if match.status is not MatchStatus.ACTIVE:
            raise AppError("MATCH_NOT_ACTIVE", "El partido no está activo.", 409, {"status": match.status})
        tournament = current_tournament(self._tournaments, user)
        if tournament.status is not TournamentStatus.ACTIVE or match.round != tournament.current_round:
            raise AppError("ROUND_NOT_ACTIVE", "El partido no es de la fecha activa.", 409)

        inserted = self._matches.insert_event(
            event_id=event_id, match_id=match.id, participant_id=me.id, player_id=player_id,
            type=type, minute=minute, created_by=user.id, access_token=user.access_token,
        )
        stored = self._matches.get_event(event_id, user.access_token)
        if stored is None:
            raise AppError("UPSTREAM_ERROR", "No se pudo leer el evento guardado.", 502)
        if not inserted:  # two identical requests raced: the other one won
            return self._same_event_or_conflict(stored, match.id, me.id, player_id, type, minute), False
        return stored, True

    def finish(self, user: CurrentUser, match_id: UUID) -> MatchDetail:
        match, me = self._for_action(user, match_id, Action.FINISH)
        t = self._transition(match, Action.FINISH)
        events = self._matches.list_events(match.id, user.access_token)
        home, away = derive_score(events, match.home_participant_id, match.away_participant_id)
        updated = self._matches.transition(
            match.id, t.source,
            {"status": t.target.value, "home_score": home, "away_score": away, "finished_at": _now()},
        )
        return self._detail(user, self._require_updated(updated), events)

    def confirm(self, user: CurrentUser, match_id: UUID) -> MatchDetail:
        match, _ = self._for_action(user, match_id, Action.CONFIRM)
        t = self._transition(match, Action.CONFIRM)
        updated = self._matches.transition(match.id, t.source, {"status": t.target.value, "confirmed_at": _now()})
        return self._detail(user, self._require_updated(updated))

    def reject(self, user: CurrentUser, match_id: UUID) -> MatchDetail:
        match, _ = self._for_action(user, match_id, Action.REJECT)
        t = self._transition(match, Action.REJECT)
        updated = self._matches.transition(match.id, t.source, {"status": t.target.value})
        return self._detail(user, self._require_updated(updated))

    # ---- admin action (the router already requires the admin role) -------------------------------

    def resolve(
        self, admin: CurrentUser, match_id: UUID, home_score: int, away_score: int, note: str | None
    ) -> MatchDetail:
        match = self._load(admin, match_id)
        t = self._transition(match, Action.RESOLVE)
        updated = self._matches.transition(
            match.id, t.source,
            {
                "status": t.target.value, "home_score": home_score, "away_score": away_score,
                "resolution_note": note, "resolved_by": str(admin.id),
            },
        )
        return self._detail(admin, self._require_updated(updated))

    # ---- helpers ---------------------------------------------------------------------------------

    def _load(self, user: CurrentUser, match_id: UUID) -> MatchRecord:
        match = self._matches.get(match_id, user.access_token)
        if match is None:
            raise AppError("MATCH_NOT_FOUND", "El partido no existe.", 404)
        return match

    def _for_action(self, user: CurrentUser, match_id: UUID, action: Action) -> tuple[MatchRecord, Participant]:
        """Authenticated (router) -> participates in the tournament -> plays this match -> is the right side."""
        match = self._load(user, match_id)
        me = own_participant(self._participants, match.tournament_id, user)
        if me.id == match.home_participant_id:
            side = Actor.HOME
        elif me.id == match.away_participant_id:
            side = Actor.AWAY
        else:
            raise AppError("NOT_IN_MATCH", "No juegas en este partido.", 403)
        required = ACTOR_BY_ACTION[action]
        if side is not required:
            raise AppError(
                f"NOT_MATCH_{required}",
                "Solo el local puede finalizar el partido." if required is Actor.HOME
                else "Solo el visitante puede confirmar o rechazar el resultado.",
                403,
            )
        return match, me

    @staticmethod
    def _transition(match: MatchRecord, action: Action) -> Transition:
        try:
            return transition(match.status, action)
        except InvalidTransition:
            raise AppError(
                "INVALID_TRANSITION", f"No se puede {action.lower()} un partido en estado {match.status}.", 409,
                {"status": match.status, "action": action},
            ) from None

    @staticmethod
    def _require_updated(updated: MatchRecord | None) -> MatchRecord:
        if updated is None:
            raise AppError("MATCH_STATE_CHANGED", "El partido cambió de estado. Vuelve a consultarlo.", 409)
        return updated

    @staticmethod
    def _same_event_or_conflict(
        stored: MatchEvent, match_id: UUID, participant_id: UUID, player_id: UUID, type: EventType, minute: int
    ) -> MatchEvent:
        same = (stored.match_id, stored.participant_id, stored.player_id, stored.type, stored.minute) == (
            match_id, participant_id, player_id, type, minute)
        if not same:
            raise AppError("EVENT_ID_CONFLICT", "Ese id de evento ya existe con otros datos.", 409)
        return stored

    def _detail(self, user: CurrentUser, match: MatchRecord, events: list[MatchEvent] | None = None) -> MatchDetail:
        if events is None:
            events = self._matches.list_events(match.id, user.access_token)
        refs: dict[UUID, ClubRef] = self._participants.club_refs(match.tournament_id, user.access_token)
        return MatchDetail(match, refs[match.home_participant_id], refs[match.away_participant_id], events)


def _now() -> str:
    return datetime.now(UTC).isoformat()
