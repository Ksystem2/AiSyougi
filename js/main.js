import { ShogiBoard } from './board.js';
import { ShogiUI } from './ui.js';
import { GameClock } from './clock.js';
import { fetchBestMove, checkEngineHealth, AiCancelledError } from './api.js';
import { INITIAL_SFEN } from './sfen.js';
import { SENTE, GOTE, AI_LEVELS, DEFAULT_AI_LEVEL, getAiLevel } from './constants.js';
import {
  installGlobalErrorHandlers,
  mountDebugPanel,
  setDebugInit,
  setDebugEngine,
  setDebugPosition,
  setDebugError,
  isDebugMode,
} from './debug.js';
import { initResponsiveLayout } from './layout.js';

installGlobalErrorHandlers();
if (isDebugMode()) {
  mountDebugPanel();
}
const relayout = initResponsiveLayout();

const LEVEL_STORAGE_KEY = 'aisyougi-ai-level';

let board;
let ui;
let clock;
let aiThinking = false;
let aiLevelId = DEFAULT_AI_LEVEL;
let aiAbortController = null;
let aiRunId = 0;

function loadAiLevel() {
  const saved = localStorage.getItem(LEVEL_STORAGE_KEY);
  if (saved && getAiLevel(saved)) {
    aiLevelId = saved;
  }
}

function updateDebugPosition() {
  if (!board) return;
  setDebugPosition(INITIAL_SFEN, board.getUsiMoves());
}

function init() {
  try {
    loadAiLevel();
    board = new ShogiBoard();
    clock = new GameClock();
    ui = new ShogiUI(board, {
      onPlayerMove: handlePlayerMove,
      onNewGame: startNewGame,
    });
    ui.setClock(clock);
    ui.setInteractive(true);
    setupLevelSelect();
    setupCancelButton();
    clock.startTurn(SENTE);
    ui.render();
    updateDebugPosition();
    setDebugInit('OK');
    relayout();
    verifyEngine();
  } catch (err) {
    setDebugInit('FAILED');
    setDebugError(err.message || String(err));
    throw err;
  }
}

async function verifyEngine() {
  const health = await checkEngineHealth();
  if (health.engine_ready) {
    setDebugEngine(`ready (${health.engine_path || 'unknown'})`);
  } else {
    setDebugEngine('not ready');
    ui.statusEl.textContent = 'AIエンジン準備中…（対局は可能）';
  }
  ui.render();
}

function setupLevelSelect() {
  const select = document.getElementById('ai-level');
  if (!select) return;

  select.innerHTML = '';
  for (const level of AI_LEVELS) {
    const opt = document.createElement('option');
    opt.value = level.id;
    opt.textContent = level.name;
    select.appendChild(opt);
  }
  select.value = aiLevelId;

  select.addEventListener('change', () => {
    aiLevelId = select.value;
    localStorage.setItem(LEVEL_STORAGE_KEY, aiLevelId);
  });
}

function setLevelSelectEnabled(enabled) {
  const select = document.getElementById('ai-level');
  if (select) select.disabled = !enabled;
}

function setupCancelButton() {
  const btn = document.getElementById('cancel-ai');
  if (!btn) return;
  btn.addEventListener('click', cancelAIThinking);
}

function cancelAIThinking() {
  if (!aiThinking) return;
  aiAbortController?.abort();
}

function startNewGame() {
  aiRunId += 1;
  aiAbortController?.abort();
  aiThinking = false;
  ui.setAiThinking(false);
  board.reset();
  clock.reset();
  clock.startTurn(SENTE);
  ui.setClock(clock);
  ui.setInteractive(true);
  setLevelSelectEnabled(true);
  ui.render();
  updateDebugPosition();
}

function handlePlayerMove(move) {
  if (aiThinking || board.gameOver) return;

  clock.stopTurn();
  const ok = board.makeMove(move);
  if (!ok) {
    clock.startTurn(SENTE);
    return;
  }

  setLevelSelectEnabled(false);
  ui.render();
  updateDebugPosition();

  if (board.gameOver) {
    ui.setInteractive(false);
    ui.render();
    return;
  }

  if (board.turn === GOTE) {
    clock.startTurn(GOTE);
    runAI();
  }
}

async function runAI() {
  const runId = aiRunId + 1;
  aiRunId = runId;
  aiAbortController = new AbortController();
  aiThinking = true;
  ui.setAiThinking(true);
  ui.setInteractive(false);
  ui.render();

  try {
    const { usi_move } = await fetchBestMove({
      sfen: INITIAL_SFEN,
      moves: board.getUsiMoves(),
      level: aiLevelId,
      signal: aiAbortController.signal,
    });

    if (runId !== aiRunId) return;

    clock.stopTurn();
    const move = board.fromUsiMove(usi_move);
    if (move && board.isLegalMove(move)) {
      board.makeMove(move);
    } else {
      console.error('Illegal USI move from engine:', usi_move);
      ui.statusEl.textContent = 'AIの手が不正です';
    }
  } catch (err) {
    if (runId !== aiRunId) return;

    console.error(err);
    if (err instanceof AiCancelledError) {
      board.undoLastMove();
      ui.statusEl.textContent = '思考を中断しました';
    } else {
      board.undoLastMove();
      setDebugError(err.message || String(err));
      ui.statusEl.textContent = err.message?.includes('Engine not found')
        ? 'AIエンジン未設定'
        : (err.message || 'AI接続エラー');
    }
    clock.stopTurn();
    clock.startTurn(SENTE);
    setLevelSelectEnabled(true);
  }

  if (runId !== aiRunId) return;

  aiAbortController = null;
  aiThinking = false;
  ui.setAiThinking(false);
  ui.setInteractive(!board.gameOver);

  if (!board.gameOver && board.turn === SENTE) {
    clock.startTurn(SENTE);
  }
  if (board.gameOver) {
    setLevelSelectEnabled(true);
  }
  updateDebugPosition();
  ui.render();
}

document.addEventListener('DOMContentLoaded', init);
