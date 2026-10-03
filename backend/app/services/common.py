"""Lookups shared by several services."""
from app.core.errors import AppError
from app.domain.tournament import Participant, Tournament
from app.domain.user import CurrentUser
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.tournament_repository import TournamentRepository


def current_tournament(tournaments: TournamentRepository, user: CurrentUser) -> Tournament:
    tournament = tournaments.get_current(user.access_token)
    if tournament is None:
        raise AppError("TOURNAMENT_NOT_FOUND", "No hay un torneo disponible.", 404)
    return tournament


def own_participant(participants: ParticipantRepository, tournament_id, user: CurrentUser) -> Participant:
    """The caller's enrolment in that tournament. The user id comes from the verified JWT, never from the request."""
    participant = participants.find_own(tournament_id, user.id, user.access_token)
    if participant is None:
        raise AppError("NOT_A_PARTICIPANT", "No participas en este torneo.", 403)
    return participant
