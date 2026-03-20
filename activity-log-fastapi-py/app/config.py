import sys

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    documentdb_uri: str = ""
    documentdb_allow_invalid_certs: bool = False
    docdb_db_name: str = "activitydb"

    def validated_uri(self) -> str:
        if not self.documentdb_uri:
            sys.exit(
                "Error: DOCUMENTDB_URI environment variable is not set.\n"
                "Copy .env.example to .env and fill in your connection string."
            )
        return self.documentdb_uri


settings = Settings()
