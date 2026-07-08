from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import CORS_ORIGINS, ENGINE_PATH, INITIAL_SFEN, LEVEL_MOVETIME_MS
from backend.usi_engine import UsiEngineError, get_engine, shutdown_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    shutdown_engine()


app = FastAPI(title="AI将棋 USI API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ThinkRequest(BaseModel):
    sfen: str = Field(default=INITIAL_SFEN, description="局面 SFEN")
    moves: list[str] = Field(default_factory=list, description="USI形式の手順")
    level: str = Field(default="normal", description="easy|normal|hard|expert")
    movetime_ms: int | None = Field(default=None, description="1手の思考時間（ミリ秒）")


class ThinkResponse(BaseModel):
    usi_move: str
    movetime_ms: int
    level: str


class HealthResponse(BaseModel):
    status: str
    engine_ready: bool
    engine_path: str


@app.get("/api/aisyougi/health", response_model=HealthResponse)
def health():
    ready = False
    try:
        get_engine()
        ready = True
    except UsiEngineError:
        pass
    return HealthResponse(
        status="ok",
        engine_ready=ready,
        engine_path=ENGINE_PATH,
    )


@app.post("/api/aisyougi/think", response_model=ThinkResponse)
def think(req: ThinkRequest):
    if req.movetime_ms and req.movetime_ms > 0:
        movetime = req.movetime_ms
    else:
        movetime = LEVEL_MOVETIME_MS.get(req.level, LEVEL_MOVETIME_MS["normal"])

    timeout_sec = max(60.0, movetime / 1000 + 30)

    try:
        engine = get_engine()
        usi_move = engine.bestmove(req.sfen, req.moves, movetime, timeout_sec=timeout_sec)
    except UsiEngineError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ThinkResponse(
        usi_move=usi_move,
        movetime_ms=movetime,
        level=req.level,
    )
