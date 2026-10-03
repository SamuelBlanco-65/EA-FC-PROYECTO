from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RawClubPage:
    html: str
    base_dir: Path  # directory that relative image paths in the html resolve against


class ScrapingSource(ABC):
    """A source of raw club pages. Swapping the source (saved files, live HTTP, other site) only
    means writing another subclass; parser, normalizer and seed do not change."""

    name: str

    @abstractmethod
    def fetch_club(self, club: dict) -> RawClubPage | None:
        """Return the raw page for one club from config/tournament-clubs.json, or None if unavailable."""
