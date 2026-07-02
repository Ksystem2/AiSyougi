import { GOTE } from './constants.js';

/**
 * ミニマックス + アルファベータ枝刈りによる将棋AI
 */
export class ShogiAI {
  /**
   * @param {import('./board.js').ShogiBoard} board
   * @param {number} depth
   */
  constructor(board, depth = 3) {
    this.board = board;
    this.depth = depth;
  }

  /**
   * @returns {object|null} 最善手
   */
  findBestMove() {
    const moves = this.board.getLegalMoves(GOTE);
    if (moves.length === 0) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;
    const alpha = -Infinity;
    const beta = Infinity;

    const ordered = this._orderMoves(moves);

    for (const move of ordered) {
      const clone = this.board.clone();
      clone.makeMove(move);
      const score = -this._negamax(clone, this.depth - 1, -beta, -alpha, GOTE);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  _orderMoves(moves) {
    return [...moves].sort((a, b) => {
      const score = (m) => {
        let s = 0;
        if (!m.drop && this.board.board[m.to.y][m.to.x]) s += 100;
        if (m.promote) s += 10;
        return s;
      };
      return score(b) - score(a);
    });
  }

  /**
   * @param {import('./board.js').ShogiBoard} board
   */
  _negamax(board, depth, alpha, beta, perspective) {
    if (depth === 0 || board.gameOver) {
      if (board.gameOver && board.winner === perspective) return 100000;
      if (board.gameOver && board.winner && board.winner !== perspective) return -100000;
      if (board.gameOver && !board.winner) return 0;
      return board.evaluate(perspective);
    }

    const owner = board.turn;
    const moves = board.getLegalMoves(owner);
    if (moves.length === 0) {
      if (board.isInCheck(owner)) {
        return board.opponent(owner) === perspective ? 100000 : -100000;
      }
      return 0;
    }

    let best = -Infinity;
    const ordered = this._orderMovesForBoard(board, moves);

    for (const move of ordered) {
      const clone = board.clone();
      clone.makeMove(move);
      const score = -this._negamax(clone, depth - 1, -beta, -alpha, perspective);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  _orderMovesForBoard(board, moves) {
    return [...moves].sort((a, b) => {
      const score = (m) => {
        let s = 0;
        if (!m.drop && board.board[m.to.y][m.to.x]) s += 100;
        if (m.promote) s += 10;
        return s;
      };
      return score(b) - score(a);
    });
  }
}
