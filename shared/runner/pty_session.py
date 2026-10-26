"""
A shell attached to a pseudo-terminal, so interactive programs (python, htop,
vim), colours and Ctrl+C behave as they do in a normal terminal window.

Windows uses ConPTY through pywinpty; Linux and macOS use the stdlib `pty`.
Every method except `wait` returns promptly; `read` and `wait` block and are
meant to run on a background thread.
"""
import os
import shutil
import sys
from typing import Dict, List, Optional


def default_shell() -> List[str]:
    """The shell people expect on this machine."""
    if sys.platform == "win32":
        for name in ("pwsh.exe", "powershell.exe"):
            path = shutil.which(name)
            if path:
                return [path, "-NoLogo"]
        return [os.environ.get("COMSPEC", "cmd.exe")]
    return [os.environ.get("SHELL") or shutil.which("bash") or "/bin/sh"]


def shell_env(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    env = dict(os.environ)
    env.update({"TERM": "xterm-256color", "COLORTERM": "truecolor", "ARCHON_RUNNER": "1"})
    env.update(extra or {})
    return env


class PtySession:
    """One shell process. `read` returns b'' once the shell has exited."""

    def __init__(self, argv: List[str], cwd: str, cols: int = 80, rows: int = 24, env: Optional[Dict[str, str]] = None):
        self.argv = argv
        self.cwd = cwd
        env = env or shell_env()
        if sys.platform == "win32":
            self._impl = _WindowsPty(argv, cwd, env, cols, rows)
        else:
            self._impl = _PosixPty(argv, cwd, env, cols, rows)

    @property
    def pid(self) -> int:
        return self._impl.pid

    def read(self) -> bytes:
        return self._impl.read()

    def write(self, data: str) -> None:
        self._impl.write(data)

    def resize(self, cols: int, rows: int) -> None:
        self._impl.resize(max(cols, 2), max(rows, 1))

    def wait(self) -> Optional[int]:
        return self._impl.wait()

    def close(self) -> None:
        self._impl.close()


class _WindowsPty:
    def __init__(self, argv, cwd, env, cols, rows):
        import ctypes

        from winpty import PtyProcess  # pywinpty

        # Shells inherit "ignore Ctrl+C" from us when we were started that way
        # (Git Bash, some IDEs, background tasks); clear it so Ctrl+C in the
        # terminal interrupts the running program.
        ctypes.windll.kernel32.SetConsoleCtrlHandler(None, False)
        self._proc = PtyProcess.spawn(argv, cwd=cwd, env=env, dimensions=(rows, cols))
        self.pid = self._proc.pid

    def read(self) -> bytes:
        while True:
            try:
                data = self._proc.read(65536)
            except EOFError:
                return b""
            if data:  # pywinpty hands back '' for its own keep-alive frames
                return data.encode("utf-8", errors="replace")

    def write(self, data: str) -> None:
        self._proc.write(data)

    def resize(self, cols: int, rows: int) -> None:
        self._proc.setwinsize(rows, cols)

    def wait(self) -> Optional[int]:
        try:
            return self._proc.wait()
        except Exception:
            return self._proc.exitstatus

    def close(self) -> None:
        if self._proc.isalive():
            self._proc.terminate(force=True)


class _PosixPty:
    def __init__(self, argv, cwd, env, cols, rows):
        import pty

        pid, fd = pty.fork()
        if pid == 0:  # child: become the shell
            try:
                os.chdir(cwd)
                os.execvpe(argv[0], argv, env)
            finally:
                os._exit(127)
        self.pid = pid
        self._fd = fd
        self._status: Optional[int] = None
        self.resize(cols, rows)

    def read(self) -> bytes:
        try:
            return os.read(self._fd, 65536)
        except OSError:  # EIO once the shell has gone
            return b""

    def write(self, data: str) -> None:
        os.write(self._fd, data.encode("utf-8"))

    def resize(self, cols: int, rows: int) -> None:
        import fcntl
        import struct
        import termios

        fcntl.ioctl(self._fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def wait(self) -> Optional[int]:
        if self._status is None:
            try:
                _, status = os.waitpid(self.pid, 0)
                self._status = os.waitstatus_to_exitcode(status)
            except ChildProcessError:
                pass
        return self._status

    def close(self) -> None:
        import signal

        try:
            os.kill(self.pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
        try:
            os.close(self._fd)
        except OSError:
            pass
