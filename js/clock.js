import { SENTE, GOTE } from './constants.js';

export function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class GameClock {
  constructor() {
    this.reset();
  }

  reset() {
    this.senteMs = 0;
    this.goteMs = 0;
    this.lastSenteMs = 0;
    this.lastGoteMs = 0;
    this.gameStartMs = Date.now();
    this.turnStartMs = Date.now();
    this.activeSide = SENTE;
  }

  startTurn(side) {
    this.activeSide = side;
    this.turnStartMs = Date.now();
  }

  stopTurn() {
    if (!this.activeSide) return 0;
    const elapsed = Date.now() - this.turnStartMs;
    if (this.activeSide === SENTE) {
      this.senteMs += elapsed;
      this.lastSenteMs = elapsed;
    } else {
      this.goteMs += elapsed;
      this.lastGoteMs = elapsed;
    }
    this.activeSide = null;
    return elapsed;
  }

  getTotalMs(side) {
    let total = side === SENTE ? this.senteMs : this.goteMs;
    if (this.activeSide === side) {
      total += Date.now() - this.turnStartMs;
    }
    return total;
  }

  getGameTotalMs() {
    return Date.now() - this.gameStartMs;
  }

  getLastMoveMs(side) {
    return side === SENTE ? this.lastSenteMs : this.lastGoteMs;
  }

  isActive(side) {
    return this.activeSide === side;
  }
}