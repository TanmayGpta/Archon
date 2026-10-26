"""
Where the runner keeps the GitHub token: the OS keychain when the `keyring`
package is installed (Windows Credential Manager, macOS Keychain, Secret
Service), otherwise a file in ~/.archon readable only by this user. The
GitHub login it belongs to is kept next to it so the IDE can show who is
signed in without ever seeing the token.
"""
import json
import os
from pathlib import Path
from typing import Optional, Tuple

SERVICE = "archon"
ACCOUNT = "github-token"


def archon_home() -> Path:
    return Path(os.environ.get("ARCHON_HOME") or Path.home() / ".archon")


class TokenStore:
    def __init__(self, home: Optional[Path] = None, use_keyring: bool = True):
        self.home = home or archon_home()
        self._keyring = None
        if use_keyring:
            try:
                import keyring

                keyring.get_password(SERVICE, ACCOUNT)  # fails fast if no backend
                self._keyring = keyring
            except Exception:
                self._keyring = None

    @property
    def backend(self) -> str:
        return "OS keychain" if self._keyring else str(self._file)

    @property
    def _file(self) -> Path:
        return self.home / "credentials.json"

    @property
    def _meta(self) -> Path:
        return self.home / "github.json"

    def get(self) -> Tuple[Optional[str], Optional[str]]:
        """(token, login), or (None, None) when nothing is stored."""
        token = self._keyring.get_password(SERVICE, ACCOUNT) if self._keyring else self._read(self._file).get("github_token")
        if not token:
            return None, None
        return token, self._read(self._meta).get("login")

    def set(self, token: str, login: Optional[str]) -> None:
        if self._keyring:
            self._keyring.set_password(SERVICE, ACCOUNT, token)
        else:
            self._write(self._file, {"github_token": token}, private=True)
        self._write(self._meta, {"login": login})

    def clear(self) -> None:
        if self._keyring:
            try:
                self._keyring.delete_password(SERVICE, ACCOUNT)
            except Exception:
                pass
        for path in (self._file, self._meta):
            path.unlink(missing_ok=True)

    @staticmethod
    def _read(path: Path) -> dict:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _write(self, path: Path, data: dict, private: bool = False) -> None:
        self.home.mkdir(parents=True, exist_ok=True)
        # Create with owner-only permissions before any secret is written
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
        if private:
            os.chmod(path, 0o600)
