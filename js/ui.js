import { SENTE, GOTE, PIECE, HAND_TYPES } from './constants.js';
import { formatClock } from './clock.js';

export class ShogiUI {
  /**
   * @param {import('./board.js').ShogiBoard} board
   * @param {object} callbacks
   */
  constructor(board, callbacks) {
    this.board = board;
    this.onPlayerMove = callbacks.onPlayerMove;
    this.onNewGame = callbacks.onNewGame;
    /** @type {import('./clock.js').GameClock|null} */
    this.clock = null;

    this.selected = null;
    this.legalTargets = [];
    this.pendingPromotion = null;
    this.interactive = true;
    this._clockTimer = null;

    this.boardEl = document.getElementById('board');
    this.senteHandEl = document.getElementById('sente-hand');
    this.goteHandEl = document.getElementById('gote-hand');
    this.aiIconEl = document.getElementById('ai-icon');
    this.statusEl = document.getElementById('status');
    this.clockSenteEl = document.getElementById('clock-sente');
    this.clockGoteEl = document.getElementById('clock-gote');
    this.clockSenteLastEl = document.getElementById('clock-sente-last');
    this.clockGoteLastEl = document.getElementById('clock-gote-last');
    this.clockTotalEl = document.getElementById('clock-total');
    this.clockRowSenteEl = document.getElementById('clock-row-sente');
    this.clockRowGoteEl = document.getElementById('clock-row-gote');
    this.promoModal = document.getElementById('promotion-modal');
    this.promoYes = document.getElementById('promo-yes');
    this.promoNo = document.getElementById('promo-no');
    this.newGameBtn = document.getElementById('new-game');
    this.cancelAiBtn = document.getElementById('cancel-ai');

    this._bindEvents();
    this.render();
  }

  setClock(clock) {
    this.clock = clock;
    this._startClockTimer();
    this._renderClock();
  }

  _startClockTimer() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    this._clockTimer = setInterval(() => {
      if (this.clock && !this.board.gameOver) {
        this._renderClock();
      }
    }, 1000);
  }

  _stopClockTimer() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }

  _renderLastMove(el, ms) {
    if (!el) return;
    el.textContent = ms > 0 ? `（直前 ${formatClock(ms)}）` : '';
  }

  _renderClock() {
    if (!this.clock) return;

    if (this.clockSenteEl) {
      this.clockSenteEl.textContent = formatClock(this.clock.getTotalMs(SENTE));
    }
    if (this.clockGoteEl) {
      this.clockGoteEl.textContent = formatClock(this.clock.getTotalMs(GOTE));
    }
    if (this.clockTotalEl) {
      this.clockTotalEl.textContent = formatClock(this.clock.getGameTotalMs());
    }
    this._renderLastMove(this.clockSenteLastEl, this.clock.getLastMoveMs(SENTE));
    this._renderLastMove(this.clockGoteLastEl, this.clock.getLastMoveMs(GOTE));

    this.clockRowSenteEl?.classList.toggle('active', this.clock.isActive(SENTE));
    this.clockRowGoteEl?.classList.toggle('active', this.clock.isActive(GOTE));
  }

  _bindEvents() {
    this.newGameBtn.addEventListener('click', () => this.onNewGame());
    this.promoYes.addEventListener('click', () => this._resolvePromotion(true));
    this.promoNo.addEventListener('click', () => this._resolvePromotion(false));
  }

  setInteractive(enabled) {
    this.interactive = enabled;
    this.boardEl.classList.toggle('disabled', !enabled);
  }

  setAiThinking(thinking) {
    this.cancelAiBtn?.classList.toggle('hidden', !thinking);
  }

  render() {
    this._renderBoard();
    this._renderHands();
    this._renderStatus();
    this._renderClock();
  }

  _renderStatus() {
    if (this.board.gameOver) {
      this.aiIconEl?.classList.remove('thinking');
      this._renderClock();
      if (this.board.winner === SENTE) {
        this.statusEl.textContent = 'あなたの勝ち！';
      } else if (this.board.winner === GOTE) {
        this.statusEl.textContent = 'AIの勝ち…';
      } else {
        this.statusEl.textContent = '引き分け';
      }
      return;
    }
    if (this.board.turn === SENTE) {
      this.aiIconEl?.classList.remove('thinking');
      this.statusEl.textContent = this.board.isInCheck(SENTE)
        ? 'あなたの番（王手！）'
        : 'あなたの番';
    } else {
      this.aiIconEl?.classList.add('thinking');
      this.statusEl.textContent = 'AIが考え中…（中断可）';
    }
  }

  _renderBoard() {
    this.boardEl.innerHTML = '';
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.y = String(y);
        cell.dataset.x = String(x);

        const isSelected =
          this.selected?.from?.y === y && this.selected?.from?.x === x;
        const isTarget = this.legalTargets.some((t) => t.y === y && t.x === x);

        if (isSelected) cell.classList.add('selected');
        if (isTarget) cell.classList.add('legal');

        const piece = this.board.getPiece(y, x);
        if (piece) {
          cell.appendChild(this._createPieceElement(piece));
        }

        cell.addEventListener('click', () => this._onCellClick(y, x));
        this.boardEl.appendChild(cell);
      }
    }
  }

  _createPieceElement(piece) {
    const eff = piece.promoted && PIECE[piece.type].promoted
      ? PIECE[piece.type].promoted
      : piece.type;
    const span = document.createElement('span');
    span.className = `piece ${piece.owner}${piece.promoted ? ' promoted' : ''}`;
    span.textContent = PIECE[eff].name;
    if (piece.owner === GOTE) span.classList.add('gote-piece');
    return span;
  }

  _renderHands() {
    this._renderHand(this.senteHandEl, SENTE, true);
    this._renderHand(this.goteHandEl, GOTE, false);
  }

  _renderHand(container, owner, isPlayer) {
    container.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'hand-label';
    label.textContent = owner === SENTE ? '先手' : '後手';
    container.appendChild(label);

    const pieces = document.createElement('div');
    pieces.className = 'hand-pieces';

    for (const type of HAND_TYPES) {
      const count = this.board.hands[owner][type];
      if (count <= 0) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hand-piece';
      if (this.selected?.drop === type && owner === SENTE) {
        btn.classList.add('selected');
      }
      btn.textContent = `${PIECE[type].name}${count > 1 ? count : ''}`;
      btn.disabled = !isPlayer || this.board.turn !== SENTE || !this.interactive;

      if (isPlayer) {
        btn.addEventListener('click', () => this._onHandClick(type));
      }
      pieces.appendChild(btn);
    }
    container.appendChild(pieces);
  }

  _onHandClick(type) {
    if (!this.interactive || this.board.turn !== SENTE) return;
    if (this.selected?.drop === type) {
      this._clearSelection();
      return;
    }
    this.selected = { drop: type };
    this.legalTargets = this.board._dropSquares(type, SENTE)
      .filter((sq) => this.board.isLegalMove({ drop: type, to: sq, owner: SENTE }));
    this.render();
  }

  _onCellClick(y, x) {
    if (!this.interactive || this.board.turn !== SENTE) return;

    if (this.selected?.drop) {
      const move = { drop: this.selected.drop, to: { y, x }, owner: SENTE };
      if (this.board.isLegalMove(move)) {
        this._clearSelection();
        this.onPlayerMove(move);
      }
      return;
    }

    const clickedPiece = this.board.getPiece(y, x);

    if (this.selected?.from) {
      const target = this.legalTargets.find((t) => t.y === y && t.x === x);
      if (target) {
        const from = this.selected.from;
        const piece = this.board.getPiece(from.y, from.x);
        const base = { from, to: { y, x }, owner: SENTE };

        if (this.board.mustPromote(piece, y)) {
          this._submitMove({ ...base, promote: true });
        } else if (this.board.canPromote(piece, from.y, y)) {
          this.pendingPromotion = base;
          this.promoModal.classList.remove('hidden');
        } else {
          this._submitMove({ ...base, promote: false });
        }
        return;
      }
    }

    if (clickedPiece && clickedPiece.owner === SENTE) {
      this.selected = { from: { y, x } };
      this.legalTargets = this.board._movesFrom(y, x, clickedPiece)
        .filter((d) => {
          const piece = clickedPiece;
          if (this.board.mustPromote(piece, d.y)) {
            return this.board.isLegalMove({
              from: { y, x }, to: { y: d.y, x: d.x }, promote: true, owner: SENTE,
            });
          }
          if (this.board.canPromote(piece, y, d.y)) {
            return this.board.isLegalMove({
              from: { y, x }, to: { y: d.y, x: d.x }, promote: false, owner: SENTE,
            }) || this.board.isLegalMove({
              from: { y, x }, to: { y: d.y, x: d.x }, promote: true, owner: SENTE,
            });
          }
          return this.board.isLegalMove({
            from: { y, x }, to: { y: d.y, x: d.x }, promote: false, owner: SENTE,
          });
        })
        .map((d) => ({ y: d.y, x: d.x }));
      this.render();
      return;
    }

    this._clearSelection();
  }

  _resolvePromotion(promote) {
    this.promoModal.classList.add('hidden');
    if (this.pendingPromotion) {
      this._submitMove({ ...this.pendingPromotion, promote });
      this.pendingPromotion = null;
    }
  }

  _submitMove(move) {
    this._clearSelection();
    this.onPlayerMove(move);
  }

  _clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }
}
