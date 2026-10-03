"""Copies the images saved with each page into data/raw/media and normalizes them to PNG."""
import shutil
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, UnidentifiedImageError

from scraper.settings import NORMALIZED_MEDIA_DIR, RAW_MEDIA_DIR

MAX_SIDE = 256  # downscale only; images are never enlarged (that would invent detail)
MIN_SIDE = 32  # smaller than this is a placeholder or a broken image
PLACEHOLDER_PREFIXES = ("player_0",)  # what SoFIFA shows for a photo that did not load when saving


def process_image(base_dir: Path, src: str | None, kind: str, external_id: str) -> tuple[str | None, str | None]:
    """kind is 'crests' or 'players'. Returns (normalized path relative to NORMALIZED_MEDIA_DIR, error code)."""
    if not src:
        return None, "IMAGE_NOT_IN_PAGE"
    source = (base_dir / unquote(src)).resolve()
    if not source.is_file():
        return None, "IMAGE_FILE_MISSING"
    if source.name.startswith(PLACEHOLDER_PREFIXES):
        return None, "IMAGE_PLACEHOLDER"

    raw_target = RAW_MEDIA_DIR / kind / f"{external_id}{source.suffix.lower()}"
    raw_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, raw_target)

    try:
        with Image.open(source) as image:
            image.load()
            if min(image.size) < MIN_SIDE:
                return None, "IMAGE_TOO_SMALL"
            image = image.convert("RGBA")
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            relative = f"{kind}/{external_id}.png"
            target = NORMALIZED_MEDIA_DIR / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError):
        return None, "IMAGE_UNREADABLE"
    return relative, None
