"""Local runner that gives the browser IDE a real terminal and holds the GitHub token."""
import asyncio
import webbrowser
from typing import List, Optional

from .server import DEFAULT_PORT, RunnerConfig, create_app
from .token_store import TokenStore

__all__ = ["DEFAULT_PORT", "RunnerConfig", "create_app", "serve"]


def serve(config: RunnerConfig, port: int = DEFAULT_PORT, open_url: Optional[str] = None, echo=print) -> None:
    """Run until Ctrl+C. Raises OSError if the port is taken."""
    from aiohttp import web

    store = TokenStore()
    app = create_app(config, store)
    _, login = store.get()

    async def main():
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", port)
        try:
            await site.start()
        except OSError:
            await runner.cleanup()
            raise
        echo(f"Archon runner on http://127.0.0.1:{port}")
        echo(f"  shell   {' '.join(config.shell)}")
        echo(f"  folder  {config.cwd}")
        echo(f"  GitHub  {'signed in as @' + login if login else 'not connected (add a token from Open from GitHub in the IDE)'}")
        echo(f"  token   {store.backend}")
        if open_url:
            echo(f"  IDE     {open_url}")
            webbrowser.open(open_url)
        echo("Press Ctrl+C to stop.")
        try:
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        echo("Runner stopped.")


def origins_for(ui_url: str, extra: List[str]) -> List[str]:
    """The IDE's origin, its localhost/127.0.0.1 twin, and any extras."""
    from urllib.parse import urlsplit

    u = urlsplit(ui_url)
    base = f"{u.scheme}://{u.netloc}"
    twins = {base}
    if u.hostname in ("localhost", "127.0.0.1"):
        other = "127.0.0.1" if u.hostname == "localhost" else "localhost"
        twins.add(f"{u.scheme}://{other}" + (f":{u.port}" if u.port else ""))
    return sorted(twins) + [o.rstrip("/") for o in extra]
