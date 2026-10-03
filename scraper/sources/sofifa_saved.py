from scraper.settings import RAW_SOFIFA_DIR, club_folder_name
from scraper.sources.base import RawClubPage, ScrapingSource


class SofifaSavedPages(ScrapingSource):
    """Reads SoFIFA team pages that the user saved by hand (Ctrl+S, 'Web page, complete') into
    scraper/data/raw/sofifa/<league>_<rank>_<club>/. No network access: SoFIFA sits behind Cloudflare
    and its robots.txt could not be read, so the project does not automate requests against it."""

    name = "sofifa-saved"

    def fetch_club(self, club: dict) -> RawClubPage | None:
        folder = RAW_SOFIFA_DIR / club_folder_name(club)
        if not folder.is_dir():
            return None
        html_files = sorted(folder.glob("*.html"))
        if len(html_files) != 1:
            return None
        return RawClubPage(html=html_files[0].read_text(encoding="utf-8"), base_dir=folder)
