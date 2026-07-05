import { getAiLevel } from './constants.js';
import { INITIAL_SFEN } from './sfen.js';

const API_BASE = (() => {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8000';
  }
  return 'https://ksystemapp.com';
})();

/**
 * @param {{ sfen?: string, moves?: string[], level?: string }} params
 */
export async function fetchBestMove({ sfen = INITIAL_SFEN, moves = [], level = 'normal' }) {
  const res = await fetch(`${API_BASE}/api/aisyougi/think`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sfen, moves, level }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : `AI API error (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function checkEngineHealth() {
  const res = await fetch(`${API_BASE}/api/aisyougi/health`);
  if (!res.ok) return { engine_ready: false };
  return res.json();
}

export function getLevelId(levelId) {
  return getAiLevel(levelId)?.id ?? 'normal';
}
