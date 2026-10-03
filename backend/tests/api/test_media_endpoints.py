"""Hermetic tests of /media/*: real JWT validation, router and service; fake MediaRepository (no Storage)."""
import uuid

import pytest

from app.api.deps import get_media_repository
from app.domain.user import UserRole

PNG = b"\x89PNG\r\n\x1a\n" + b"fake-image-bytes"


class FakeMedia:
    def __init__(self):
        self.crests: dict[uuid.UUID, str | None] = {}
        self.photos: dict[uuid.UUID, str | None] = {}
        self.objects: dict[str, bytes] = {}
        self.downloads = 0

    def crest_path(self, club_id):
        return self.crests.get(club_id)

    def photo_path(self, player_id):
        return self.photos.get(player_id)

    def download(self, path):
        self.downloads += 1
        return self.objects.get(path)


@pytest.fixture
def media(app):
    fake = FakeMedia()
    app.dependency_overrides[get_media_repository] = lambda: fake
    return fake


@pytest.fixture
def headers(profiles, make_token, auth_header):
    return auth_header(make_token(profiles.add(UserRole.PARTICIPANT)))


def test_crest_requires_authentication(client, media):
    club = uuid.uuid4()
    assert client.get(f"/media/crests/{club}").status_code == 401
    assert media.downloads == 0  # nothing is read from Storage for an anonymous caller


def test_player_photo_requires_authentication(client, media):
    assert client.get(f"/media/players/{uuid.uuid4()}").status_code == 401


def test_crest_is_returned_as_png_with_cache_headers(client, media, headers):
    club = uuid.uuid4()
    media.crests[club] = f"crests/{club}.png"
    media.objects[f"crests/{club}.png"] = PNG
    response = client.get(f"/media/crests/{club}", headers=headers)
    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, max-age=86400"
    assert response.headers["etag"]


def test_player_photo_is_returned(client, media, headers):
    player = uuid.uuid4()
    media.photos[player] = f"players/{player}.png"
    media.objects[f"players/{player}.png"] = PNG
    response = client.get(f"/media/players/{player}", headers=headers)
    assert response.status_code == 200
    assert response.content == PNG


def test_same_etag_gives_304_without_body(client, media, headers):
    club = uuid.uuid4()
    media.crests[club] = "c.png"
    media.objects["c.png"] = PNG
    etag = client.get(f"/media/crests/{club}", headers=headers).headers["etag"]
    again = client.get(f"/media/crests/{club}", headers={**headers, "If-None-Match": etag})
    assert again.status_code == 304
    assert again.content == b""


def test_changed_image_changes_etag(client, media, headers):
    club = uuid.uuid4()
    media.crests[club] = "c.png"
    media.objects["c.png"] = PNG
    old = client.get(f"/media/crests/{club}", headers=headers).headers["etag"]
    media.objects["c.png"] = PNG + b"v2"
    response = client.get(f"/media/crests/{club}", headers={**headers, "If-None-Match": old})
    assert response.status_code == 200
    assert response.headers["etag"] != old


@pytest.mark.parametrize("kind", ["crests", "players"])
def test_unknown_id_is_404(client, media, headers, kind):
    response = client.get(f"/media/{kind}/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "MEDIA_NOT_FOUND"


def test_row_without_image_path_is_404_and_skips_storage(client, media, headers):
    club = uuid.uuid4()
    media.crests[club] = None  # scraper found no image: column is NULL
    assert client.get(f"/media/crests/{club}", headers=headers).status_code == 404
    assert media.downloads == 0


def test_path_in_db_but_object_missing_is_404(client, media, headers):
    club = uuid.uuid4()
    media.crests[club] = "crests/gone.png"
    assert client.get(f"/media/crests/{club}", headers=headers).status_code == 404


def test_invalid_uuid_is_422(client, media, headers):
    assert client.get("/media/crests/not-a-uuid", headers=headers).status_code == 422
