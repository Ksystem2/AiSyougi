import { getAiLevel } from './constants.js';
import { INITIAL_SFEN } from './sfen.js';
import { isDebugMode, setDebugApiBase } from './debug.js';

const API_BASE = (() => {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8000';
  }
  return 'https://ksystemapp.com';
})();

if (isDebugMode()) {
  setDebugApiBase(API_BASE);
}

const THINK_TIMEOUT_MS = 65000;

export class AiCancelledError extends Error {
  constructor() {
    super('AI思考を中断しました');
    this.name = 'AiCancelledError';
  }
}

async function fetchJson(url, options = {}, timeoutMs = 15000, externalSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * @param {{ sfen?: string, moves?: string[], level?: string, signal?: AbortSignal }} params
 */
export async function fetchBestMove({ sfen = INITIAL_SFEN, moves = [], level = 'normal', signal } = {}) {
  let res;
  try {
    res = await fetchJson(
      `${API_BASE}/api/aisyougi/think`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sfen, moves, level }),
      },
      THINK_TIMEOUT_MS,
      signal,
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      if (signal?.aborted) {
        throw new AiCancelledError();
      }
      throw new Error('AI思考がタイムアウトしました');
    }
    throw err;
  }

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
  try {
    const res = await fetchJson(`${API_BASE}/api/aisyougi/health`, {}, 10000);
    if (!res.ok) return { engine_ready: false };
    return res.json();
  } catch {
    return { engine_ready: false };
  }
}

export function getLevelId(levelId) {
  return getAiLevel(levelId)?.id ?? 'normal';
}