import queue
import subprocess
import threading
import time
from pathlib import Path

from backend.config import ENGINE_CWD, ENGINE_PATH


class UsiEngineError(Exception):
    pass


class UsiEngine:
    def __init__(self, engine_path: str, cwd: str | None = None):
        path = Path(engine_path)
        if not path.is_file():
            raise UsiEngineError(
                f"Engine not found: {engine_path}. Set YANEURAOU_PATH."
            )

        work_dir = cwd or str(path.parent)
        self.proc = subprocess.Popen(
            [str(path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            cwd=work_dir,
        )
        self._q: queue.Queue[str] = queue.Queue()
        self._reader = threading.Thread(target=self._read_stdout, daemon=True)
        self._reader.start()

        self.send("usi")
        self._wait_token("usiok", timeout=15)
        self.send("isready")
        self._wait_token("readyok", timeout=15)

    def _read_stdout(self) -> None:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            line = line.strip()
            if line:
                self._q.put(line)

    def send(self, cmd: str) -> None:
        if self.proc.stdin is None:
            raise UsiEngineError("stdin unavailable")
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _wait_token(self, token: str, timeout: float = 30) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = self._q.get(timeout=max(0.05, deadline - time.time()))
            except queue.Empty:
                continue
            if token in line:
                return line
        raise UsiEngineError(f"timeout waiting for {token}")

    def bestmove(
        self,
        sfen: str,
        moves: list[str],
        movetime_ms: int,
        timeout_sec: float = 60,
    ) -> str:
        pos = f"position sfen {sfen}"
        if moves:
            pos += " moves " + " ".join(moves)

        self.send(pos)
        self.send(f"go movetime {movetime_ms}")

        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            try:
                line = self._q.get(timeout=max(0.05, deadline - time.time()))
            except queue.Empty:
                continue
            if line.startswith("bestmove "):
                parts = line.split()
                if len(parts) < 2:
                    raise UsiEngineError(f"invalid bestmove: {line}")
                move = parts[1]
                if move in ("resign", "win"):
                    raise UsiEngineError(f"engine resigned: {move}")
                return move

        raise UsiEngineError("bestmove timeout")

    def quit(self) -> None:
        try:
            self.send("quit")
        except Exception:
            pass
        try:
            self.proc.wait(timeout=3)
        except Exception:
            self.proc.kill()


_engine: UsiEngine | None = None


def get_engine() -> UsiEngine:
    global _engine
    if _engine is None:
        _engine = UsiEngine(ENGINE_PATH, ENGINE_CWD)
    return _engine


def shutdown_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.quit()
        _engine = None
