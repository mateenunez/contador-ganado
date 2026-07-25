from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    roboflow_api_key: str = ""
    roboflow_model: str = ""  # e.g. workspace/model-name/version
    confidence: float = 0.4
    overlap: float = 0.3

    allowed_origins: str = "http://localhost:5173"
    max_upload_mb: int = 15

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_configured(self) -> bool:
        return bool(self.roboflow_api_key and self.roboflow_model)


@lru_cache
def get_settings() -> Settings:
    return Settings()
