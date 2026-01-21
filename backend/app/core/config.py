from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "YOLO Trading API"
    debug: bool = False
    
    # Chain - using Alchemy RPC for reliability
    # Set BASE_RPC_URL environment variable (e.g., in .env file)
    base_rpc_url: str  # Required: must be set via BASE_RPC_URL env var
    chain_id: int = 8453
    
    # CORS - allow all origins in development
    # In production, set CORS_ORIGINS env var to restrict
    cors_origins: list[str] = ["*"]
    
    # Avantis
    # Note: No private key needed - we only build unsigned txs
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
