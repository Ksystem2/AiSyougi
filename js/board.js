import { SENTE, GOTE, PIECE, HAND_TYPES, BOARD_SIZE } from './constants.js';
import { boardToSfen, moveToUsiForHistory, usiToMove, INITIAL_SFEN } from './sfen.js';

/** @typedef {{ type: string, owner: string, promoted: boolean }} Piece */

/**
 * @param {string} owner
 * @returns {number} 前進方向（行）
 */
function forwardDir(owner) {
  return owner === SENTE ? -1 : 1;
}

/**
 * @param {string} owner
 * @param {number} y
 * @returns {boolean}
 */
function inPromotionZone(owner, y) {
  return owner === SENTE ? y <= 2 : y >= 6;
}

export class ShogiBoard {
  constructor() {
    this.reset();
  }

  reset() {
    /** @type {(Piece|null)[][]} */
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.hands = {
      [SENTE]: Object.fromEntries(HAND_TYPES.map((t) => [t, 0])),
      [GOTE]: Object.fromEntries(HAND_TYPES.map((t) => [t, 0])),
    };
    this.turn = SENTE;
    this.moveHistory = [];
    this.gameOver = false;
    this.winner = null;
    this._setupInitialPosition();
    this._refreshKingPos();
  }

  _setupInitialPosition() {
    const back = (owner, y, types) => {
      for (let x = 0; x < BOARD_SIZE; x++) {
        this.board[y][x] = { type: types[x], owner, promoted: false };
      }
    };
    back(GOTE, 0, ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']);
    this.board[1][1] = { type: 'R', owner: GOTE, promoted: false };
    this.board[1][7] = { type: 'B', owner: GOTE, promoted: false };
    for (let x = 0; x < BOARD_SIZE; x++) {
      this.board[2][x] = { type: 'P', owner: GOTE, promoted: false };
    }
    back(SENTE, 8, ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']);
    this.board[7][1] = { type: 'B', owner: SENTE, promoted: false };
    this.board[7][7] = { type: 'R', owner: SENTE, promoted: false };
    for (let x = 0; x < BOARD_SIZE; x++) {
      this.board[6][x] = { type: 'P', owner: SENTE, promoted: false };
    }
  }

  clone() {
    const copy = new ShogiBoard();
    copy.board = this.board.map((row) =>
      row.map((cell) => (cell ? { ...cell } : null))
    );
    copy.hands = {
      [SENTE]: { ...this.hands[SENTE] },
      [GOTE]: { ...this.hands[GOTE] },
    };
    copy.turn = this.turn;
    copy.gameOver = this.gameOver;
    copy.winner = this.winner;
    return copy;
  }

  getPiece(y, x) {
    if (y < 0 || y >= BOARD_SIZE || x < 0 || x >= BOARD_SIZE) return null;
    return this.board[y][x];
  }

  effectiveType(piece) {
    if (!piece) return null;
    if (piece.promoted && PIECE[piece.type].promoted) {
      return PIECE[piece.type].promoted;
    }
    return piece.type;
  }

  opponent(owner) {
    return owner === SENTE ? GOTE : SENTE;
  }

  _refreshKingPos() {
    this.kingPos = {
      [SENTE]: this.findKing(SENTE),
      [GOTE]: this.findKing(GOTE),
    };
  }

  _trackKingMove(piece, from, to) {
    if (piece.type !== 'K') return;
    this.kingPos[piece.owner] = { y: to.y, x: to.x };
  }

  _trackKingUndo(piece, from) {
    if (piece.type !== 'K') return;
    this.kingPos[piece.owner] = { y: from.y, x: from.x };
  }

  _capturedHandType(captured) {
    if (!captured) return null;
    const demoteMap = { PS: 'S', PN: 'N', PL: 'L', PP: 'P', DR: 'R', DH: 'B' };
    return captured.promoted
      ? (demoteMap[captured.type] || captured.type)
      : captured.type;
  }

  _saveUndo(move) {
    const { from, to, drop, owner } = move;
    if (drop) {
      return {
        move,
        captured: null,
        fromPiece: null,
        handType: drop,
        handCount: this.hands[owner][drop],
        turn: this.turn,
        gameOver: this.gameOver,
        winner: this.winner,
      };
    }
    const captured = this.board[to.y][to.x];
    const capType = this._capturedHandType(captured);
    return {
      move,
      captured: captured ? { ...captured } : null,
      fromPiece: { ...this.board[from.y][from.x] },
      handType: capType,
      handCount: capType ? this.hands[owner][capType] : 0,
      turn: this.turn,
      gameOver: this.gameOver,
      winner: this.winner,
    };
  }

  _restoreUndo(undo) {
    const { move, captured, fromPiece, handType, handCount, turn, gameOver, winner } = undo;
    const { from, to, drop, owner } = move;

    this.turn = turn;
    this.gameOver = gameOver;
    this.winner = winner;

    if (drop) {
      this.board[to.y][to.x] = null;
      this.hands[owner][drop] = handCount;
      return;
    }

    this.board[from.y][from.x] = fromPiece;
    if (captured) {
      this.board[to.y][to.x] = captured;
      this.hands[owner][handType] = handCount;
      this._trackKingUndo(fromPiece, from);
    } else {
      this.board[to.y][to.x] = null;
      this._trackKingUndo(fromPiece, from);
    }
  }

  /** 手を適用して合法性だけ確認（クローンなし） */
  _isLegalMoveInPlace(move, owner) {
    const undo = this._saveUndo(move);
    this._executeMove(move);
    const legal = !this.isInCheck(owner);
    this._restoreUndo(undo);
    return legal;
  }

  findKing(owner) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = this.board[y][x];
        if (p && p.owner === owner && p.type === 'K') return { y, x };
      }
    }
    return null;
  }

  /**
   * @param {number} y
   * @param {number} x
   * @param {Piece} piece
   * @param {boolean} forAttack - 王の位置チェック用（自分の駒を飛び越えない）
   */
  _movesFrom(y, x, piece, forAttack = false) {
    const eff = this.effectiveType(piece);
    const dir = forwardDir(piece.owner);
    const moves = [];

    const add = (ty, tx) => {
      if (ty < 0 || ty >= BOARD_SIZE || tx < 0 || tx >= BOARD_SIZE) return false;
      const target = this.board[ty][tx];
      if (target) {
        if (target.owner !== piece.owner) moves.push({ y: ty, x: tx, capture: true });
        return false;
      }
      moves.push({ y: ty, x: tx, capture: false });
      return true;
    };

    const slide = (dy, dx) => {
      let cy = y + dy;
      let cx = x + dx;
      while (cy >= 0 && cy < BOARD_SIZE && cx >= 0 && cx < BOARD_SIZE) {
        const target = this.board[cy][cx];
        if (target) {
          if (target.owner !== piece.owner) moves.push({ y: cy, x: cx, capture: true });
          break;
        }
        moves.push({ y: cy, x: cx, capture: false });
        cy += dy;
        cx += dx;
      }
    };

    const offsets = (list) => {
      for (const [dy, dx] of list) add(y + dy, x + dx);
    };

    switch (eff) {
      case 'K':
        offsets([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
        break;
      case 'G':
      case 'PS':
      case 'PN':
      case 'PL':
      case 'PP':
        offsets([[dir,-1],[dir,0],[dir,1],[0,-1],[0,1],[-dir,0]]);
        break;
      case 'S':
        offsets([[dir,-1],[dir,0],[dir,1],[-dir,-1],[-dir,1]]);
        break;
      case 'N':
        add(y + dir * 2, x - 1);
        add(y + dir * 2, x + 1);
        break;
      case 'L':
        slide(dir, 0);
        break;
      case 'P':
        add(y + dir, x);
        break;
      case 'R':
        slide(-1,0); slide(1,0); slide(0,-1); slide(0,1);
        break;
      case 'B':
        slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1);
        break;
      case 'DR':
        slide(-1,0); slide(1,0); slide(0,-1); slide(0,1);
        offsets([[-1,-1],[-1,1],[1,-1],[1,1]]);
        break;
      case 'DH':
        slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1);
        offsets([[-1,0],[1,0],[0,-1],[0,1]]);
        break;
      default:
        break;
    }

    if (forAttack) return moves;

  return moves;
  }

  isSquareAttacked(y, x, byOwner) {
    for (let cy = 0; cy < BOARD_SIZE; cy++) {
      for (let cx = 0; cx < BOARD_SIZE; cx++) {
        const p = this.board[cy][cx];
        if (!p || p.owner !== byOwner) continue;
        const attacks = this._movesFrom(cy, cx, p, true);
        if (attacks.some((m) => m.y === y && m.x === x)) return true;
      }
    }
    // 持ち駒の打ちによる攻撃（歩・香のみ直線、桂は特殊）
  for (const type of HAND_TYPES) {
      if (this.hands[byOwner][type] <= 0) continue;
      const dropMoves = this._dropSquares(type, byOwner, true);
      if (dropMoves.some((m) => m.y === y && m.x === x)) return true;
    }
    return false;
  }

  isInCheck(owner) {
    const king = this.kingPos?.[owner] || this.findKing(owner);
    if (!king) return true;
    return this.isSquareAttacked(king.y, king.x, this.opponent(owner));
  }

  mustPromote(piece, toY) {
    const eff = this.effectiveType(piece);
    if (piece.promoted || !PIECE[piece.type].promoted) return false;
    const dir = forwardDir(piece.owner);
    if (eff === 'P' || eff === 'L') {
      return toY === (piece.owner === SENTE ? 0 : 8);
    }
    if (eff === 'N') {
      return toY === (piece.owner === SENTE ? 0 : 8) ||
        toY === (piece.owner === SENTE ? 1 : 7);
    }
    return false;
  }

  canPromote(piece, fromY, toY) {
    if (piece.promoted || !PIECE[piece.type].promoted) return false;
    const zoneFrom = inPromotionZone(piece.owner, fromY);
    const zoneTo = inPromotionZone(piece.owner, toY);
    return zoneFrom || zoneTo;
  }

  hasUnpromotedPawnOnFile(owner, fileX) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      const p = this.board[y][fileX];
      if (p && p.owner === owner && p.type === 'P' && !p.promoted) return true;
    }
    return false;
  }

  _dropSquares(type, owner, forAttack = false) {
    const moves = [];
    const dir = forwardDir(owner);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (this.board[y][x]) continue;
        if (type === 'P' && !forAttack) {
          if (this.hasUnpromotedPawnOnFile(owner, x)) continue;
          if (y === (owner === SENTE ? 0 : 8)) continue;
        }
        if (type === 'L' && y === (owner === SENTE ? 0 : 8)) continue;
        if (type === 'N') {
          if (y === (owner === SENTE ? 0 : 8) || y === (owner === SENTE ? 1 : 7)) continue;
        }
        moves.push({ y, x });
      }
    }
    return moves;
  }

  _applyMoveOnClone(board, move) {
    const b = board.clone();
    b._executeMove(move);
    return b;
  }

  _executeMove(move) {
    const { from, to, drop, promote, owner } = move;
    if (drop) {
      this.board[to.y][to.x] = { type: drop, owner, promoted: false };
      this.hands[owner][drop]--;
    } else {
      const piece = this.board[from.y][from.x];
      const captured = this.board[to.y][to.x];
      this.board[from.y][from.x] = null;
      if (captured) {
        const capType = this._capturedHandType(captured);
        this.hands[owner][capType] = (this.hands[owner][capType] || 0) + 1;
      }
      const newPiece = { ...piece };
      if (promote) newPiece.promoted = true;
      this.board[to.y][to.x] = newPiece;
      this._trackKingMove(piece, from, to);
    }
    this.turn = this.opponent(owner);
  }

  /**
   * @param {{ from?: {y:number,x:number}, to: {y:number,x:number}, drop?: string, promote?: boolean, owner: string }} move
   */
  isLegalMove(move) {
    if (this.gameOver) return false;
    const owner = move.owner;
    if (owner !== this.turn) return false;

    if (move.drop) {
      if (!HAND_TYPES.includes(move.drop)) return false;
      if (this.hands[owner][move.drop] <= 0) return false;
      const squares = this._dropSquares(move.drop, owner);
      if (!squares.some((s) => s.y === move.to.y && s.x === move.to.x)) return false;
      // 打ち歩詰めの簡易チェックは省略（厳密実装は複雑なため）
    } else {
      const piece = this.getPiece(move.from.y, move.from.x);
      if (!piece || piece.owner !== owner) return false;
      const moves = this._movesFrom(move.from.y, move.from.x, piece);
      const dest = moves.find((m) => m.y === move.to.y && m.x === move.to.x);
      if (!dest) return false;
      if (move.promote) {
        if (this.mustPromote(piece, move.to.y)) {
          // ok
        } else if (!this.canPromote(piece, move.from.y, move.to.y)) {
          return false;
        }
      } else if (this.mustPromote(piece, move.to.y)) {
        return false;
      }
    }

    const after = this._isLegalMoveInPlace(move, owner);
    return after;
  }

  getLegalMoves(owner = this.turn) {
    const moves = [];

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = this.board[y][x];
        if (!piece || piece.owner !== owner) continue;
        const dests = this._movesFrom(y, x, piece);
        for (const d of dests) {
          const base = { from: { y, x }, to: { y: d.y, x: d.x }, owner };
          if (this.mustPromote(piece, d.y)) {
            const m = { ...base, promote: true };
            if (this.isLegalMove(m)) moves.push(m);
          } else if (this.canPromote(piece, y, d.y)) {
            const m0 = { ...base, promote: false };
            const m1 = { ...base, promote: true };
            if (this.isLegalMove(m0)) moves.push(m0);
            if (this.isLegalMove(m1)) moves.push(m1);
          } else {
            const m = { ...base, promote: false };
            if (this.isLegalMove(m)) moves.push(m);
          }
        }
      }
    }

    for (const type of HAND_TYPES) {
      if (this.hands[owner][type] <= 0) continue;
      for (const sq of this._dropSquares(type, owner)) {
        const m = { drop: type, to: sq, owner };
        if (this.isLegalMove(m)) moves.push(m);
      }
    }

    return moves;
  }

  makeMove(move) {
    if (!this.isLegalMove(move)) return false;
    this._executeMove(move);
    this.moveHistory.push(move);

    const opp = this.opponent(move.owner);
    const oppMoves = this.getLegalMoves(opp);
    if (oppMoves.length === 0) {
      this.gameOver = true;
      this.winner = this.isInCheck(opp) ? move.owner : null;
    }
    return true;
  }

  undoLastMove() {
    if (!this.moveHistory.length) return false;
    const history = this.moveHistory.slice(0, -1);
    this.reset();
    for (const m of history) {
      this.makeMove(m);
    }
    return true;
  }

  evaluate(owner) {
    let score = 0;
    const opp = this.opponent(owner);

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = this.board[y][x];
        if (!p) continue;
        const eff = this.effectiveType(p);
        const val = (PIECE[eff]?.value ?? 0) + this._positionalBonus(p, y, x);
        score += p.owner === owner ? val : -val;
      }
    }
    for (const type of HAND_TYPES) {
      const v = PIECE[type].value;
      score += (this.hands[owner][type] || 0) * v;
      score -= (this.hands[opp][type] || 0) * v;
    }
    if (this.isInCheck(opp)) score += 200;
    if (this.isInCheck(owner)) score -= 280;
    return score;
  }

  _positionalBonus(piece, y, x) {
    const eff = this.effectiveType(piece);
    const owner = piece.owner;
    const adv = owner === SENTE ? (6 - y) : (y - 2);
    let bonus = 0;

    if (eff === 'P') bonus += Math.max(0, adv) * 12;
    else if (eff === 'PP') bonus += Math.max(0, adv) * 6;
    else if (eff === 'S' || eff === 'PS') bonus += Math.max(0, adv) * 5;
    else if (eff === 'N' || eff === 'PN') bonus += Math.max(0, adv) * 3;
    else if (eff === 'L' || eff === 'PL') bonus += Math.max(0, adv) * 2;

    if (eff === 'R' || eff === 'DR' || eff === 'B' || eff === 'DH') {
      bonus += (4 - Math.abs(x - 4)) * 4;
    }
    if (eff === 'G') {
      const king = this.kingPos?.[owner];
      if (king && Math.abs(king.x - x) <= 1 && Math.abs(king.y - y) <= 1) {
        bonus += 15;
      }
    }
    return bonus;
  }

  toSfen() {
    return boardToSfen(this);
  }

  getUsiMoves() {
    return this.moveHistory.map((m) => moveToUsiForHistory(m));
  }

  fromUsiMove(usi) {
    return usiToMove(this, usi);
  }

  static initialSfen() {
    return INITIAL_SFEN;
  }
}
