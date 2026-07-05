import { SENTE, GOTE, HAND_TYPES, BOARD_SIZE } from './constants.js';

export const INITIAL_SFEN =
  'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

const SFEN_PIECE = {
  [SENTE]: {
    K: 'K', R: 'R', B: 'B', G: 'G', S: 'S', N: 'N', L: 'L', P: 'P',
    DR: '+R', DH: '+B', PS: '+S', PN: '+N', PL: '+L', PP: '+P',
  },
  [GOTE]: {
    K: 'k', R: 'r', B: 'b', G: 'g', S: 's', N: 'n', L: 'l', P: 'p',
    DR: '+r', DH: '+b', PS: '+s', PN: '+n', PL: '+l', PP: '+p',
  },
};

const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

/** @param {number} y @param {number} x */
export function coordToUsi(y, x) {
  const file = 9 - x;
  const rank = String.fromCharCode('a'.charCodeAt(0) + y);
  return `${file}${rank}`;
}

/** @param {string} sq e.g. "7g" */
export function usiToCoord(sq) {
  const file = parseInt(sq[0], 10);
  const rank = sq.charCodeAt(1) - 'a'.charCodeAt(0);
  return { y: rank, x: 9 - file };
}

/**
 * @param {import('./board.js').ShogiBoard} board
 */
export function boardToSfen(board) {
  const rows = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    let row = '';
    let empty = 0;
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = board.getPiece(y, x);
      if (!p) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      const eff = board.effectiveType(p);
      row += SFEN_PIECE[p.owner][eff];
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }

  const turn = board.turn === SENTE ? 'b' : 'w';
  const hands = formatHands(board);
  return `${rows.join('/')} ${turn} ${hands} 1`;
}

function formatHands(board) {
  let sente = '';
  let gote = '';
  for (const type of HAND_ORDER) {
    const s = board.hands[SENTE][type] || 0;
    const g = board.hands[GOTE][type] || 0;
    if (s > 0) sente += s > 1 ? `${s}${type}` : type;
    if (g > 0) gote += g > 1 ? `${g}${type.toLowerCase()}` : type.toLowerCase();
  }
  const combined = sente + gote;
  return combined || '-';
}

/**
 * @param {import('./board.js').ShogiBoard} board
 * @param {object} move
 */
export function moveToUsi(board, move) {
  if (move.drop) {
    const sq = coordToUsi(move.to.y, move.to.x);
    return `${move.drop}*${sq}`;
  }
  const from = coordToUsi(move.from.y, move.from.x);
  const to = coordToUsi(move.to.y, move.to.x);
  return move.promote ? `${from}${to}+` : `${from}${to}`;
}

/**
 * @param {import('./board.js').ShogiBoard} board
 * @param {string} usi
 */
export function usiToMove(board, usi) {
  const owner = board.turn;
  const promote = usi.endsWith('+');
  const body = promote ? usi.slice(0, -1) : usi;

  if (body.includes('*')) {
    const [piece, sq] = body.split('*');
    const to = usiToCoord(sq);
    return { drop: piece, to, owner };
  }

  const from = usiToCoord(body.slice(0, 2));
  const to = usiToCoord(body.slice(2, 4));
  return { from, to, promote, owner };
}

export function moveToUsiForHistory(move) {
  if (move.drop) {
    const sq = coordToUsi(move.to.y, move.to.x);
    return `${move.drop}*${sq}`;
  }
  const from = coordToUsi(move.from.y, move.from.x);
  const to = coordToUsi(move.to.y, move.to.x);
  return move.promote ? `${from}${to}+` : `${from}${to}`;
}
