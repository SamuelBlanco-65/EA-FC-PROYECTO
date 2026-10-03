"""Factories for the Supabase clients. Only repositories import this module.

Why a NEW client per Auth operation: supabase-py rewrites the client's own `Authorization` header
whenever a user signs in (`_listen_to_auth_events`). A shared client would therefore start sending
the last user's token to everyone else.
"""
from functools import lru_cache

import httpx
from postgrest import SyncPostgrestClient
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from app.core.config import Settings


def new_auth_client(settings: Settings) -> Client:
    """Client with the PUBLISHABLE key, used only for Supabase Auth calls (sign up / in / refresh)."""
    options = SyncClientOptions(auto_refresh_token=False, persist_session=False)
    return create_client(settings.supabase_url, settings.supabase_publishable_key.get_secret_value(), options)


@lru_cache
def _shared_http() -> httpx.Client:
    # One pooled connection set for PostgREST: the profile lookup runs on every authenticated request.
    return httpx.Client(timeout=httpx.Timeout(10.0), http2=True, follow_redirects=True)


def user_postgrest(settings: Settings, access_token: str) -> SyncPostgrestClient:
    """PostgREST client acting AS THE USER: Postgres sees role=authenticated and RLS applies."""
    return SyncPostgrestClient(
        settings.rest_url,
        headers={
            "apikey": settings.supabase_publishable_key.get_secret_value(),
            "Authorization": f"Bearer {access_token}",
        },
        http_client=_shared_http(),
    )
