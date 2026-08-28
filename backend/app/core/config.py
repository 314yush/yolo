from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import ValidationError, field_validator, model_validator
from functools import lru_cache
from typing import Optional
from urllib.parse import urlsplit
import json
import os


PRODUCTION = "production"
DEVELOPMENT = "development"
TEST = "test"
VALID_ENVIRONMENTS = (PRODUCTION, DEVELOPMENT, TEST)

# The apex redirects to www, but both are sent as Origin depending on entry
# point, so both must be allowed. tradeonyolo.fun is NOT a live domain.
PRODUCTION_CORS_ORIGINS = [
    "https://tradeyolo.fun",
    "https://www.tradeyolo.fun",
]

DEV_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def redact_url(url: Optional[str]) -> str:
    """Reduce a URL to scheme://host so embedded API keys never reach logs."""
    if not url:
        return "<unset>"
    try:
        parts = urlsplit(url)
    except ValueError:
        return "<unparseable>"
    if not parts.scheme or not parts.hostname:
        return "<unparseable>"
    host = parts.hostname
    if parts.port:
        host = f"{host}:{parts.port}"
    return f"{parts.scheme}://{host}"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "YOLO Trading API"
    environment: str = PRODUCTION
    debug: bool = False

    # Chain - Base mainnet RPC (Alchemy). Contains an API key; never log it raw.
    base_rpc_url: str
    chain_id: int = 8453

    # Database - PostgreSQL connection string. Mandatory in production.
    database_url: Optional[str] = None

    # Public-endpoint rate limits (requests per window, per client IP)
    rate_limit_default: str = "240/minute"
    rate_limit_write: str = "30/minute"
    wallet_rate_limit_max: int = 60
    wallet_rate_limit_window_seconds: int = 60

    # Reject request bodies larger than this before parsing them.
    max_request_body_bytes: int = 16 * 1024

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # CORS_ORIGINS is read directly in the cors_origins property
    )

    @field_validator("environment", mode="before")
    @classmethod
    def validate_environment(cls, v: object) -> str:
        if v is None or str(v).strip() == "":
            return PRODUCTION
        s = str(v).strip().lower()
        aliases = {"prod": PRODUCTION, "dev": DEVELOPMENT, "local": DEVELOPMENT, "testing": TEST}
        s = aliases.get(s, s)
        if s not in VALID_ENVIRONMENTS:
            raise ValueError(
                f"ENVIRONMENT must be one of {', '.join(VALID_ENVIRONMENTS)} (got {s!r})"
            )
        return s

    @field_validator("base_rpc_url", mode="before")
    @classmethod
    def validate_base_rpc_url(cls, v: object) -> str:
        s = str(v or "").strip()
        if not s:
            raise ValueError("BASE_RPC_URL must be set")
        if not s.startswith("http://") and not s.startswith("https://"):
            raise ValueError("BASE_RPC_URL must be an http(s) URL")
        return s

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, v: object) -> Optional[str]:
        """A malformed DATABASE_URL is always fatal; absence is checked per environment."""
        if v is None or str(v).strip() == "":
            return None
        s = str(v).strip()
        if not s.startswith("postgres://") and not s.startswith("postgresql://"):
            raise ValueError(
                "DATABASE_URL must start with postgres:// or postgresql:// "
                f"(got {redact_url(s)})"
            )
        return s

    @model_validator(mode="after")
    def enforce_environment_invariants(self) -> "Settings":
        if self.environment != PRODUCTION:
            return self

        if self.debug:
            raise ValueError(
                "DEBUG=true is not allowed when ENVIRONMENT=production: it would expose "
                "/docs and /redoc. Set ENVIRONMENT=development for local debugging."
            )

        if not self.database_url:
            raise ValueError(
                "DATABASE_URL is required when ENVIRONMENT=production. Activity logging "
                "cannot run without it and the app refuses to start in a degraded mode."
            )

        if "*" in self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must not contain '*' when ENVIRONMENT=production. "
                f"Set an explicit allowlist, e.g. {','.join(PRODUCTION_CORS_ORIGINS)}."
            )

        return self

    @property
    def is_production(self) -> bool:
        return self.environment == PRODUCTION

    @property
    def redacted_rpc_url(self) -> str:
        return redact_url(self.base_rpc_url)

    @property
    def cors_origins(self) -> list[str]:
        """
        Parse CORS_ORIGINS. Read from os.environ rather than declared as a field to
        avoid pydantic-settings' JSON-only parsing of list fields.
        """
        cors_env = os.getenv("CORS_ORIGINS")
        if cors_env is None or not cors_env.strip():
            return list(PRODUCTION_CORS_ORIGINS) if self.is_production else list(DEV_CORS_ORIGINS)

        cors_env = cors_env.strip()

        if cors_env.startswith("["):
            try:
                parsed = json.loads(cors_env)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                origins = [str(o).strip() for o in parsed if str(o).strip()]
                if origins:
                    return origins

        origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
        if origins:
            return origins

        return list(PRODUCTION_CORS_ORIGINS) if self.is_production else list(DEV_CORS_ORIGINS)


class ConfigurationError(RuntimeError):
    """Startup configuration is invalid or unsafe."""


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Pydantic's ValidationError repr embeds the whole input mapping, which on this
    service includes unrelated secrets pulled from the environment. Only field
    names and messages are re-raised so a failed boot cannot leak them to logs.
    """
    try:
        return Settings()
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(part) for part in error['loc']) or 'config'}: {error['msg']}"
            for error in exc.errors()
        )
        raise ConfigurationError(f"Invalid backend configuration. {problems}") from None
