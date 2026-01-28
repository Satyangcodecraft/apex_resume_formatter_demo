from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_PATH = str(Path(__file__).resolve().parents[1] / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_PATH, extra="ignore")

    llm_provider: str = "openai"  # openai | mistral

    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    mistral_api_key: str = ""
    mistral_model: str = "mistral-large-latest"

    frontend_origin: str = "http://localhost:3000"


settings = Settings()
