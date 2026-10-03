"""The hermetic suite must run on a fresh clone with no backend/.env: `app.main` builds the app (and reads Settings)
at import time. Dummy values are set ONLY when the file is missing: environment variables take priority over the
.env file, so setting them unconditionally would hide the real keys from the integration tests."""
import os

from app.core.config import ENV_PATH

if not ENV_PATH.exists():
    os.environ.setdefault("SUPABASE_URL", "https://hermetic-tests.invalid")
    os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "hermetic-publishable-key")
    os.environ.setdefault("SUPABASE_SECRET_KEY", "hermetic-secret-key")
    os.environ.setdefault("REALTIME_LISTENER_ENABLED", "false")
