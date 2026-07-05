import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
_LINUX_ENGINE = "/app/engine/YaneuraOu"
_WIN_ENGINE = r"C:\engines\YaneuraOu\YaneuraOu-Deep-NNUE.exe"
_DEFAULT_ENGINE = _LINUX_ENGINE if Path(_LINUX_ENGINE).is_file() else _WIN_ENGINE
ENGINE_PATH = os.environ.get("YANEURAOU_PATH", _DEFAULT_ENGINE)
ENGINE_CWD = os.environ.get(
    "YANEURAOU_CWD",
    str(Path(ENGINE_PATH).parent) if ENGINE_PATH else str(BASE_DIR),
)

LEVEL_MOVETIME_MS = {
    "easy": 500,
    "normal": 1500,
    "hard": 3000,
    "expert": 5000,
}

INITIAL_SFEN = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
)

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "https://ksystemapp.com",
]
