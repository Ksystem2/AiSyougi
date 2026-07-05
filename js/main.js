import { ShogiBoard } from './board.js';
import { ShogiUI } from './ui.js';
import { GameClock } from './clock.js';
import { fetchBestMove } from './api.js';
import { INITIAL_SFEN } from './sfen.js';
import { SENTE, GOTE, AI_LEVELS, DEFAULT_AI_LEVEL, getAiLevel } from './constants.js';

const LEVEL_STORAGE_KEY = 'aisyougi-ai-level';

let board;
let ui;
let clock;
let aiThinking = false;
let aiLevelId = DEFAULT_AI_LEVEL;

function loadAiLevel() {
  const saved = localStorage.getItem(LEVEL_STORAGE_KEY);
  if (saved && getAiLevel(saved)) {
    aiLevelId = saved;
  }
}

function init() {
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

function startNewGame() {
  aiThinking = false;
  board.reset();
  clock.reset();
  clock.startTurn(SENTE);
  ui.setClock(clock);
  ui.setInteractive(true);
  setLevelSelectEnabled(true);
  ui.render();
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
  aiThinking = true;
  ui.setInteractive(false);
  ui.render();

  try {
    const { usi_move } = await fetchBestMove({
      sfen: INITIAL_SFEN,
      moves: board.getUsiMoves(),
      level: aiLevelId,
    });

    clock.stopTurn();
    const move = board.fromUsiMove(usi_move);
    if (move && board.isLegalMove(move)) {
      board.makeMove(move);
    } else {
      console.error('Illegal USI move from engine:', usi_move);
      ui.statusEl.textContent = 'AIの手が不正です';
    }
  } catch (err) {
    console.error(err);
    board.undoLastMove();
    ui.statusEl.textContent = err.message?.includes('Engine not found')
      ? 'AIエンジン未設定（YANEURAOU_PATH）'
      : 'AI接続エラー（バックエンド未起動？）';
    clock.stopTurn();
    clock.startTurn(SENTE);
    setLevelSelectEnabled(true);
  }

  aiThinking = false;
  ui.setInteractive(!board.gameOver);

  if (!board.gameOver && board.turn === SENTE) {
    clock.startTurn(SENTE);
  }
  if (board.gameOver) {
    setLevelSelectEnabled(true);
  }
  ui.render();
}

document.addEventListener('DOMContentLoaded', init);
