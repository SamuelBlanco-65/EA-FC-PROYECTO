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
def shared_http() -> httpx.Client:
    # One pooled connection set for PostgREST: the profile lookup runs on every authenticated request.
    # HTTP/1.1 on purpose. With http2=True every thread shared ONE multiplexed connection; when the server
    # dropped it ("RemoteProtocolError: Server disconnected") all in-flight requests died together (9 of 15
    # simultaneous assign-club calls, 2 of 3 runs). With HTTP/1.1 a drop only hits one request.
    return httpx.Client(timeout=httpx.Timeout(10.0), http2=False, follow_redirects=True)


def service_postgrest(settings: Settings) -> SyncPostgrestClient:
    """PostgREST client with the SECRET key (role=service_role, bypasses RLS). Callers must have
    already authorised the request themselves."""
    key = settings.supabase_secret_key.get_secret_value()
    return SyncPostgrestClient(
        settings.rest_url,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        http_client=shared_http(),
    )


def user_postgrest(settings: Settings, access_token: str) -> SyncPostgrestClient:
    """PostgREST client acting AS THE USER: Postgres sees role=authenticated and RLS applies."""
    return SyncPostgrestClient(
        settings.rest_url,
        headers={
            "apikey": settings.supabase_publishable_key.get_secret_value(),
            "Authorization": f"Bearer {access_token}",
        },
        http_client=shared_http(),
    )
