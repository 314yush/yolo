from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from functools import lru_cache
from typing import Optional
import json
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "YOLO Trading API"
    debug: bool = False
    
    # Chain - using Alchemy RPC for reliability
    # Set BASE_RPC_URL environment variable (e.g., in .env file)
    base_rpc_url: str  # Required: must be set via BASE_RPC_URL env var
    chain_id: int = 8453
    
    # Database - PostgreSQL connection string
    database_url: Optional[str] = None
    
    # Admin API key for code generation
    admin_api_key: Optional[str] = None
    
    # CORS - allow all origins in development
    # In production, set CORS_ORIGINS env var to restrict
    # Supports both JSON array format: ["https://example.com"]
    # and comma-separated string: https://example.com,https://other.com
    # Note: This is a computed property, not a field, to avoid pydantic-settings JSON parsing issues
    
    # Avantis
    # Note: No private key needed - we only build unsigned txs
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # Ignore extra environment variables (like CORS_ORIGINS which is handled as a property)
    )
    
    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS_ORIGINS from environment variable."""
        # Get from environment directly to avoid pydantic-settings JSON parsing
        cors_env = os.getenv('CORS_ORIGINS', '*')
        
        # Try JSON first
        if isinstance(cors_env, str) and cors_env.strip().startswith('['):
            try:
                parsed = json.loads(cors_env)
                if isinstance(parsed, list):
                    return parsed if parsed else ["*"]
            except json.JSONDecodeError:
                pass
        
        # Fall back to comma-separated string
        if isinstance(cors_env, str):
            if ',' in cors_env:
                origins = [origin.strip() for origin in cors_env.split(',') if origin.strip()]
                return origins if origins else ["*"]
            # Single string
            if cors_env.strip() and cors_env.strip() != '*':
                return [cors_env.strip()]
        
        return ["*"]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
