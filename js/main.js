import { ShogiBoard } from './board.js';
import { ShogiAI } from './ai.js';
import { ShogiUI } from './ui.js';
import { GOTE } from './constants.js';

let board;
let ui;
let aiThinking = false;

function init() {
  board = new ShogiBoard();
  ui = new ShogiUI(board, {
    onPlayerMove: handlePlayerMove,
    onNewGame: startNewGame,
  });
  ui.setInteractive(true);
}

function startNewGame() {
  aiThinking = false;
  board.reset();
  ui.setInteractive(true);
  ui.render();
}

function handlePlayerMove(move) {
  if (aiThinking || board.gameOver) return;
  const ok = board.makeMove(move);
  if (!ok) return;

  ui.render();

  if (board.gameOver) {
    ui.setInteractive(false);
    return;
  }

  if (board.turn === GOTE) {
    runAI();
  }
}

function runAI() {
  aiThinking = true;
  ui.setInteractive(false);
  ui.render();

  setTimeout(() => {
    const engine = new ShogiAI(board, 3);
    const move = engine.findBestMove();
    if (move) {
      board.makeMove(move);
    }
    aiThinking = false;
    ui.setInteractive(!board.gameOver);
    ui.render();
  }, 300);
}

document.addEventListener('DOMContentLoaded', init);
