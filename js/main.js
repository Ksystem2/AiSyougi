import { ShogiBoard } from './board.js';
import { ShogiUI } from './ui.js';
import { GameClock } from './clock.js';
import { fetchBestMove, checkEngineHealth, AiCancelledError } from './api.js';
import { INITIAL_SFEN } from './sfen.js';
import {
  SENTE,
  GOTE,
  AI_LEVELS,
  DEFAULT_AI_LEVEL,
  DEFAULT_GAME_MODE,
  GAME_MODE_AI_VS_AI,
  getAiLevel,
} from './constants.js';
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
import { initBgm } from './bgm.js';

installGlobalErrorHandlers();
if (isDebugMode()) {
  mountDebugPanel();
}
const relayout = initResponsiveLayout();
const bgm = initBgm();

const LEVEL_STORAGE_KEY = 'aisyougi-ai-level';
const MODE_STORAGE_KEY = 'aisyougi-game-mode';
const AI_VS_AI_PACE_MS = 450;

let board;
let ui;
let clock;
let aiThinking = false;
let aiLevelId = DEFAULT_AI_LEVEL;
let gameMode = DEFAULT_GAME_MODE;
let aiAbortController = null;
let aiRunId = 0;
let aiVsAiStopped = false;
let engineReady = false;
let engineCheckDone = false;

function thinkTimeoutMs() {
  const level = getAiLevel(aiLevelId);
  return Math.min(45000, (level?.movetimeMs ?? 5000) + 20000);
}

function isAiVsAiMode() {
  return gameMode === GAME_MODE_AI_VS_AI;
}

function shouldRunAI() {
  return !(isDebugMode() && !engineReady);
}

function shouldAutoPlaySide(side) {
  if (!shouldRunAI() || !engineReady || aiVsAiStopped) return false;
  if (isAiVsAiMode()) return true;
  return side === GOTE;
}

function updateOfflinePlayMode() {
  if (!ui) return;
  ui.debugOffline = isDebugMode() && !engineReady;
}

function loadSettings() {
  const savedLevel = localStorage.getItem(LEVEL_STORAGE_KEY);
  if (savedLevel && getAiLevel(savedLevel)) {
    aiLevelId = savedLevel;
  }
  const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
  if (savedMode === 'human' || savedMode === GAME_MODE_AI_VS_AI) {
    gameMode = savedMode;
  }
}

function updateDebugPosition() {
  if (!board) return;
  setDebugPosition(INITIAL_SFEN, board.getUsiMoves());
}

function init() {
  try {
    loadSettings();
    board = new ShogiBoard();
    clock = new GameClock();
    ui = new ShogiUI(board, {
      onPlayerMove: handlePlayerMove,
      onNewGame: startNewGame,
    });
    ui.setGameMode(gameMode);
    ui.setClock(clock);
    ui.setInteractive(false);
    setupModeSelect();
    setupLevelSelect();
    setupCancelButton();
    setupRetryButton();
    clock.startTurn(SENTE);
    ui.render();
    updateDebugPosition();
    setDebugInit('OK');
    relayout();
    verifyEngine().then(enablePlayAfterEngineCheck);
  } catch (err) {
    setDebugInit('FAILED');
    setDebugError(err.message || String(err));
    throw err;
  }
}

async function verifyEngine() {
  try {
    const health = await checkEngineHealth();
    engineReady = !!health.engine_ready;
    updateOfflinePlayMode();
    if (health.engine_ready) {
      setDebugEngine(`ready (${health.engine_path || 'unknown'})`);
    } else {
      setDebugEngine('not ready');
      if (isDebugMode()) {
        ui.statusEl.textContent = 'デバッグ: API未接続（先手・後手を手動で操作できます）';
      } else {
        ui.statusEl.textContent = 'AIエンジン準備中…（対局は可能）';
      }
    }
  } catch (err) {
    console.error(err);
    setDebugError(err.message || String(err));
  } finally {
    engineCheckDone = true;
  }
}

function enablePlayAfterEngineCheck() {
  if (!ui || board.gameOver) return;
  updateOfflinePlayMode();
  if (isAiVsAiMode()) {
    ui.setInteractive(false);
    if (engineReady) {
      ui.statusEl.textContent = 'AI vs AI：「新しい対局」で開始';
    }
  } else {
    ui.setInteractive(shouldRunAI() ? board.turn === SENTE : true);
  }
  ui.render();
}

function setupModeSelect() {
  const select = document.getElementById('game-mode');
  if (!select) return;

  select.value = gameMode;
  select.addEventListener('change', () => {
    gameMode = select.value;
    localStorage.setItem(MODE_STORAGE_KEY, gameMode);
    ui.setGameMode(gameMode);
    ui.render();
  });
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

function setSettingsEnabled(enabled) {
  const level = document.getElementById('ai-level');
  const mode = document.getElementById('game-mode');
  if (level) level.disabled = !enabled;
  if (mode) mode.disabled = !enabled;
}

function setLevelSelectEnabled(enabled) {
  setSettingsEnabled(enabled);
}

function setupCancelButton() {
  const btn = document.getElementById('cancel-ai');
  if (!btn) return;
  btn.addEventListener('click', cancelAIThinking);
}

function setupRetryButton() {
  const btn = document.getElementById('retry-ai');
  if (!btn) return;
  btn.addEventListener('click', retryAI);
}

async function retryAI() {
  const health = await checkEngineHealth();
  engineReady = !!health.engine_ready;
  updateOfflinePlayMode();
  if (!engineReady) {
    setDebugEngine('not ready');
    ui.statusEl.textContent = 'AIエンジン未接続です';
    ui.render();
    return;
  }
  setDebugEngine(`ready (${health.engine_path || 'unknown'})`);
  aiVsAiStopped = false;
  ui.setAiRetryPending?.(false);
  if (!board.gameOver && shouldAutoPlaySide(board.turn)) {
    scheduleRunAI();
  }
}

function cancelAIThinking() {
  if (!aiThinking) return;
  if (isAiVsAiMode()) {
    aiVsAiStopped = true;
  }
  aiAbortController?.abort();
}

function scheduleRunAI() {
  if (!shouldAutoPlaySide(board.turn) || board.gameOver) return;
  window.setTimeout(() => {
    if (!board.gameOver && shouldAutoPlaySide(board.turn)) {
      void runAI();
    }
  }, isAiVsAiMode() ? AI_VS_AI_PACE_MS : 0);
}

function startNewGame() {
  aiRunId += 1;
  aiAbortController?.abort();
  aiThinking = false;
  aiVsAiStopped = false;
  ui.setAiThinking(false);
  ui.setAiThinkingSide(false);
  ui.setAiRetryPending?.(false);
  board.reset();
  clock.reset();
  clock.startTurn(SENTE);
  ui.setClock(clock);
  setLevelSelectEnabled(true);
  ui.render();
  updateDebugPosition();
  bgm.onGameStart();

  if (isAiVsAiMode()) {
    ui.setInteractive(false);
    if (!engineCheckDone) {
      ui.statusEl.textContent = 'AIエンジン確認中…';
      ui.render();
      return;
    }
    if (!engineReady) {
      ui.statusEl.textContent = 'AIエンジン未接続です';
      ui.render();
      return;
    }
    setLevelSelectEnabled(false);
    scheduleRunAI();
    return;
  }

  ui.setInteractive(true);
}

function handlePlayerMove(move) {
  if (aiThinking || board.gameOver || isAiVsAiMode()) return;

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
    bgm.onGameEnd();
    ui.setInteractive(false);
    ui.render();
    return;
  }

  if (board.turn === GOTE && shouldRunAI()) {
    if (!engineCheckDone) {
      ui.statusEl.textContent = 'AIエンジン確認中…';
      ui.render();
      return;
    }
    if (!engineReady) {
      updateOfflinePlayMode();
      ui.setInteractive(true);
      ui.render();
      return;
    }
    clock.startTurn(GOTE);
    scheduleRunAI();
    return;
  }

  updateOfflinePlayMode();
  ui.setInteractive(true);
  if (board.turn === SENTE) {
    clock.stopTurn();
    clock.startTurn(SENTE);
    setLevelSelectEnabled(true);
  } else {
    clock.stopTurn();
    clock.startTurn(GOTE);
  }
  ui.render();
}

async function runAI() {
  if (!shouldAutoPlaySide(board.turn)) {
    updateOfflinePlayMode();
    ui.setInteractive(!isAiVsAiMode() && (shouldRunAI() ? board.turn === SENTE : true));
    ui.render();
    return;
  }

  const thinkingSide = board.turn;
  const runId = aiRunId + 1;
  aiRunId = runId;
  aiAbortController = new AbortController();
  aiThinking = true;
  ui.setAiThinking(true);
  ui.setAiThinkingSide(true);
  ui.setAiRetryPending?.(false);
  ui.setInteractive(false);
  ui.render();

  let retryPending = false;

  try {
    const { usi_move } = await fetchBestMove({
      sfen: INITIAL_SFEN,
      moves: board.getUsiMoves(),
      level: aiLevelId,
      signal: aiAbortController.signal,
      timeoutMs: thinkTimeoutMs(),
    });

    if (runId !== aiRunId) return;

    clock.stopTurn();
    const move = board.fromUsiMove(usi_move);
    if (move && board.isLegalMove(move)) {
      board.makeMove(move);
    } else {
      console.error('Illegal USI move from engine:', usi_move);
      const sideLabel = thinkingSide === SENTE ? '先手' : '後手';
      ui.statusEl.textContent = `${sideLabel}AIの手が不正です`;
      retryPending = true;
      clock.stopTurn();
      clock.startTurn(thinkingSide);
    }
  } catch (err) {
    if (runId !== aiRunId) return;

    console.error(err);
    if (err instanceof AiCancelledError) {
      if (isAiVsAiMode()) {
        ui.statusEl.textContent = 'AI対局を停止しました';
      } else {
        board.undoLastMove();
        ui.statusEl.textContent = '思考を中断しました';
        clock.stopTurn();
        clock.startTurn(SENTE);
        setLevelSelectEnabled(true);
      }
    } else {
      setDebugError(err.message || String(err));
      const msg = err.message?.includes('Engine not found')
        ? 'AIエンジン未設定'
        : (err.message || 'AI接続エラー');
      ui.statusEl.textContent = `${msg}（「AI再試行」で再送できます）`;
      retryPending = true;
      clock.stopTurn();
      clock.startTurn(thinkingSide);
    }
  } finally {
    if (runId !== aiRunId) return;

    aiAbortController = null;
    aiThinking = false;
    ui.setAiThinking(false);
    ui.setAiThinkingSide(false);
    ui.setAiRetryPending?.(retryPending);
    updateOfflinePlayMode();
    ui.setInteractive(!board.gameOver && !isAiVsAiMode() && (shouldRunAI() ? board.turn === SENTE : true));

    if (!board.gameOver) {
      const next = board.turn;
      clock.startTurn(next);
      if (shouldAutoPlaySide(next)) {
        scheduleRunAI();
      } else if (!isAiVsAiMode() && next === SENTE) {
        setLevelSelectEnabled(true);
      }
    } else {
      bgm.onGameEnd();
      setLevelSelectEnabled(true);
    }
    updateDebugPosition();
    ui.render();
  }
}

document.addEventListener('DOMContentLoaded', init);
