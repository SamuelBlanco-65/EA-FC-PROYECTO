from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import JwtVerifier, get_jwt_verifier
from app.domain.user import CurrentUser, UserRole
from app.repositories.auth_repository import AuthRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.lineup_repository import LineupRepository
from app.repositories.match_repository import MatchRepository
from app.repositories.media_repository import MediaRepository
from app.repositories.participant_repository import ParticipantRepository
from app.repositories.player_repository import PlayerRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.tournament_repository import TournamentRepository
from app.services.admin_service import AdminService
from app.services.auth_service import AuthService
from app.services.match_service import MatchService
from app.services.media_service import MediaService
from app.services.squad_service import SquadService
from app.services.tournament_service import TournamentService

# auto_error=False: a missing header must produce OUR error body (401), not FastAPI's default 403.
bearer_scheme = HTTPBearer(auto_error=False, description="Access token devuelto por /auth/login")


def get_auth_repository(settings: Settings = Depends(get_settings)) -> AuthRepository:
    return AuthRepository(settings)


def get_profile_repository(settings: Settings = Depends(get_settings)) -> ProfileRepository:
    return ProfileRepository(settings)


def get_tournament_repository(settings: Settings = Depends(get_settings)) -> TournamentRepository:
    return TournamentRepository(settings)


def get_participant_repository(settings: Settings = Depends(get_settings)) -> ParticipantRepository:
    return ParticipantRepository(settings)


def get_club_repository(settings: Settings = Depends(get_settings)) -> ClubRepository:
    return ClubRepository(settings)


def get_tournament_service(
    tournaments: TournamentRepository = Depends(get_tournament_repository),
    participants: ParticipantRepository = Depends(get_participant_repository),
    clubs: ClubRepository = Depends(get_club_repository),
) -> TournamentService:
    return TournamentService(tournaments, participants, clubs)


def get_match_repository(settings: Settings = Depends(get_settings)) -> MatchRepository:
    return MatchRepository(settings)


def get_player_repository(settings: Settings = Depends(get_settings)) -> PlayerRepository:
    return PlayerRepository(settings)


def get_lineup_repository(settings: Settings = Depends(get_settings)) -> LineupRepository:
    return LineupRepository(settings)


def get_match_service(
    matches: MatchRepository = Depends(get_match_repository),
    participants: ParticipantRepository = Depends(get_participant_repository),
    tournaments: TournamentRepository = Depends(get_tournament_repository),
    players: PlayerRepository = Depends(get_player_repository),
) -> MatchService:
    return MatchService(matches, participants, tournaments, players)


def get_admin_service(
    tournaments: TournamentRepository = Depends(get_tournament_repository),
    participants: ParticipantRepository = Depends(get_participant_repository),
    matches: MatchRepository = Depends(get_match_repository),
) -> AdminService:
    return AdminService(tournaments, participants, matches)


def get_squad_service(
    tournaments: TournamentRepository = Depends(get_tournament_repository),
    participants: ParticipantRepository = Depends(get_participant_repository),
    players: PlayerRepository = Depends(get_player_repository),
    lineups: LineupRepository = Depends(get_lineup_repository),
) -> SquadService:
    return SquadService(tournaments, participants, players, lineups)


def get_media_repository(settings: Settings = Depends(get_settings)) -> MediaRepository:
    return MediaRepository(settings)


def get_media_service(media: MediaRepository = Depends(get_media_repository)) -> MediaService:
    return MediaService(media)


def get_auth_service(
    auth_repo: AuthRepository = Depends(get_auth_repository),
    profile_repo: ProfileRepository = Depends(get_profile_repository),
    verifier: JwtVerifier = Depends(get_jwt_verifier),
) -> AuthService:
    return AuthService(auth_repo, profile_repo, verifier)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    service: AuthService = Depends(get_auth_service),
) -> CurrentUser:
    if credentials is None:
        raise AppError(
            "NOT_AUTHENTICATED", "Falta el token de acceso.", 401, headers={"WWW-Authenticate": "Bearer"}
        )
    user = service.authenticate(credentials.credentials)
    request.state.user_id = str(user.id)  # read by the request-log middleware
    return user


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != UserRole.ADMIN:
        raise AppError("FORBIDDEN", "Requiere rol de administrador.", 403)
    return user
