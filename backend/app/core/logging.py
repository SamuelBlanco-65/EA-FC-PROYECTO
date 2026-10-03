import logging
import re
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Defense in depth: even if a token or key reaches a log message by mistake, it is masked.
_SECRET_PATTERNS = [
    re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"),  # JWT
    re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+"),  # Supabase API keys
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+"),
]


def redact(text: str) -> str:
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class _RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


_HANDLER_MARK = "_ea_fc_handler"


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())
    if any(getattr(h, _HANDLER_MARK, False) for h in root.handlers):
        return
    handler = logging.StreamHandler()
    setattr(handler, _HANDLER_MARK, True)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(
        _RedactingFormatter("%(asctime)s %(levelname)s %(name)s [req=%(request_id)s] %(message)s")
    )
    root.addHandler(handler)
    # httpx logs every outgoing URL at INFO (Supabase calls): noise, and ids in query strings.
    # `realtime` logs its connect URL (it carries the secret key as ?apikey=) and every payload at DEBUG.
    for noisy in ("httpx", "httpcore", "hpack", "realtime", "websockets"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
