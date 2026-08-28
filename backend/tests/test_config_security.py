"""
Tests for fail-closed configuration, route surface, and payload validation.
These run without a database.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.config import redact_url
from app.models.schemas import LogOpenRequest, OnboardingCompleteRequest

VALID_RPC = "https://base-mainnet.g.alchemy.com/v2/secret-key"
VALID_DB = "postgresql://user:pass@host:5432/db"


def _settings(monkeypatch, **env):
    for key in (
        "ENVIRONMENT",
        "DEBUG",
        "DATABASE_URL",
        "CORS_ORIGINS",
        "BASE_RPC_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    # _env_file=None keeps the developer's local .env out of these assertions
    return Settings(_env_file=None)


def test_defaults_to_production(monkeypatch):
    settings = _settings(monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL=VALID_DB)
    assert settings.environment == "production"
    assert settings.is_production


def test_production_requires_database_url(monkeypatch):
    with pytest.raises(ValidationError, match="DATABASE_URL is required"):
        _settings(monkeypatch, BASE_RPC_URL=VALID_RPC)


def test_production_rejects_debug(monkeypatch):
    with pytest.raises(ValidationError, match="DEBUG=true is not allowed"):
        _settings(monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL=VALID_DB, DEBUG="true")


def test_malformed_database_url_is_fatal(monkeypatch):
    with pytest.raises(ValidationError, match="must start with postgres"):
        _settings(monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL="my-postgres-host")


def test_malformed_database_url_is_fatal_in_development(monkeypatch):
    with pytest.raises(ValidationError, match="must start with postgres"):
        _settings(
            monkeypatch,
            ENVIRONMENT="development",
            BASE_RPC_URL=VALID_RPC,
            DATABASE_URL="my-postgres-host",
        )


def test_production_rejects_wildcard_cors(monkeypatch):
    with pytest.raises(ValidationError, match="must not contain"):
        _settings(
            monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL=VALID_DB, CORS_ORIGINS="*"
        )


def test_unknown_environment_is_rejected(monkeypatch):
    with pytest.raises(ValidationError, match="ENVIRONMENT must be one of"):
        _settings(monkeypatch, ENVIRONMENT="staging", BASE_RPC_URL=VALID_RPC)


def test_missing_rpc_url_is_fatal(monkeypatch):
    with pytest.raises(ValidationError, match="(?i)base_rpc_url"):
        _settings(monkeypatch, DATABASE_URL=VALID_DB)


def test_cors_defaults_are_explicit(monkeypatch):
    prod = _settings(monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL=VALID_DB)
    assert prod.cors_origins == ["https://tradeyolo.fun", "https://www.tradeyolo.fun"]

    dev = _settings(monkeypatch, ENVIRONMENT="development", BASE_RPC_URL=VALID_RPC)
    assert "*" not in dev.cors_origins
    assert all(o.startswith(("http://localhost", "http://127.0.0.1")) for o in dev.cors_origins)


def test_cors_accepts_comma_separated_and_json(monkeypatch):
    comma = _settings(
        monkeypatch,
        BASE_RPC_URL=VALID_RPC,
        DATABASE_URL=VALID_DB,
        CORS_ORIGINS="https://tradeyolo.fun, https://www.tradeyolo.fun",
    )
    assert comma.cors_origins == ["https://tradeyolo.fun", "https://www.tradeyolo.fun"]

    as_json = _settings(
        monkeypatch,
        BASE_RPC_URL=VALID_RPC,
        DATABASE_URL=VALID_DB,
        CORS_ORIGINS='["https://tradeyolo.fun"]',
    )
    assert as_json.cors_origins == ["https://tradeyolo.fun"]


def test_redacted_rpc_url_hides_key(monkeypatch):
    settings = _settings(monkeypatch, BASE_RPC_URL=VALID_RPC, DATABASE_URL=VALID_DB)
    assert settings.redacted_rpc_url == "https://base-mainnet.g.alchemy.com"
    assert "secret-key" not in settings.redacted_rpc_url


def test_redact_url_hides_credentials():
    assert redact_url("postgresql://user:pass@db.internal:5432/railway") == "postgresql://db.internal:5432"
    assert redact_url(None) == "<unset>"
    assert redact_url("not-a-url") == "<unparseable>"


def test_startup_failure_does_not_leak_environment_secrets(monkeypatch):
    from app.core.config import ConfigurationError, get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("BASE_RPC_URL", VALID_RPC)
    monkeypatch.setenv("UNRELATED_SECRET_TOKEN", "sk-must-not-appear-in-logs")

    get_settings.cache_clear()
    try:
        with pytest.raises(ConfigurationError) as exc:
            get_settings()
    finally:
        get_settings.cache_clear()

    message = str(exc.value)
    assert "DATABASE_URL is required" in message
    assert "sk-must-not-appear-in-logs" not in message
    assert "secret-key" not in message


def _iter_routes(routes):
    """
    Newer Starlette exposes included routers as `_IncludedRouter` objects that
    have no `.path` and nest their real routes, so walk the tree instead of
    assuming a flat list of concrete routes.
    """
    for route in routes:
        if getattr(route, "path", None) is not None:
            yield route
        nested = getattr(route, "routes", None)
        if nested:
            yield from _iter_routes(nested)


def _route_paths(app):
    return [route.path for route in _iter_routes(app.routes)]


def test_access_and_admin_routes_are_gone():
    from app.main import app

    paths = set(_route_paths(app))
    assert paths, "no routes discovered; route introspection is broken"
    assert not any(p.startswith("/access") for p in paths)
    assert not any(p.startswith("/admin") for p in paths)
    assert "/health" in paths


def test_no_duplicate_route_registrations():
    from app.main import app

    seen = []
    for route in _iter_routes(app.routes):
        for method in getattr(route, "methods", set()):
            seen.append((method, route.path))
    assert seen, "no routes discovered; route introspection is broken"
    assert len(seen) == len(set(seen)), "duplicate route registration"


def test_access_code_model_is_removed():
    import app.core.database as database

    assert not hasattr(database, "AccessCode")
    assert "access_codes" not in database.Base.metadata.tables


def test_log_open_rejects_out_of_range_values():
    base = {
        "wallet": "0x" + "1" * 40,
        "pair": "BTC/USD",
        "pair_index": 1,
        "trade_index": 0,
        "direction": "LONG",
        "leverage": 100,
        "collateral": 5.0,
        "entry_price": 95000.0,
    }
    LogOpenRequest(**base)

    for bad in (
        {"leverage": 10**9},
        {"leverage": 0},
        {"collateral": 1e18},
        {"collateral": -1},
        {"entry_price": 0},
        {"wallet": "0xnope"},
        {"pair": "not a pair"},
        {"direction": "SIDEWAYS"},
        {"tx_hash": "0xabc"},
        {"pair_index": -1},
    ):
        with pytest.raises(ValidationError):
            LogOpenRequest(**{**base, **bad})


def test_log_open_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        LogOpenRequest(
            wallet="0x" + "1" * 40,
            pair="BTC/USD",
            pair_index=1,
            trade_index=0,
            direction="LONG",
            leverage=100,
            collateral=5.0,
            entry_price=95000.0,
            injected="payload",
        )


def test_onboarding_request_normalises_wallet():
    request = OnboardingCompleteRequest(wallet="0x" + "AB" * 20)
    assert request.wallet == "0x" + "ab" * 20
