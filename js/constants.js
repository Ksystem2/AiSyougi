/** 駒種・評価値・表示名 */
export const SENTE = 'sente';
export const GOTE = 'gote';

export const PIECE = {
  K:  { name: '王', promoted: null,  value: 10000 },
  R:  { name: '飛', promoted: 'DR',   value: 950 },
  DR: { name: '龍', promoted: null,   value: 1400 },
  B:  { name: '角', promoted: 'DH',   value: 900 },
  DH: { name: '馬', promoted: null,   value: 1300 },
  G:  { name: '金', promoted: null,   value: 600 },
  S:  { name: '銀', promoted: 'PS',   value: 500 },
  PS: { name: '全', promoted: null,   value: 600 },
  N:  { name: '桂', promoted: 'PN',   value: 400 },
  PN: { name: '圭', promoted: null,   value: 600 },
  L:  { name: '香', promoted: 'PL',   value: 350 },
  PL: { name: '杏', promoted: null,   value: 600 },
  P:  { name: '歩', promoted: 'PP',   value: 100 },
  PP: { name: 'と', promoted: null,   value: 600 },
};

export const HAND_TYPES = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

export const BOARD_SIZE = 9;

/** 先手から見た筋の表示（右が1筋） */
export const FILE_LABELS = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

/** 段の表示 */
export const RANK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
