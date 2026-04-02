from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PORT: int = 8000
    ENV: str = "local"

    # Auth
    JWT_SECRET_KEY: str = "dev-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # Database
    # Default to SQLite for local dev; docker-compose uses Postgres via .env.example.
    DATABASE_URL: str = "sqlite:///./cdb_intel.db"

    # Elasticsearch
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX: str = "profiles_v1"
    ELASTICSEARCH_TIMEOUT_SECONDS: int = 30

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"


settings = Settings()

