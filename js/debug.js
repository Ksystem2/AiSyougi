const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

/** @type {{ init: string, engine: string, sfen: string, moves: string, lastError: string, apiBase: string }} */
const state = {
  init: 'pending',
  engine: '-',
  sfen: '-',
  moves: '-',
  lastError: '',
  apiBase: '-',
};

let panelEl = null;

export function isDebugMode() {
  return IS_LOCAL;
}

export function setDebugApiBase(base) {
  if (!IS_LOCAL) return;
  state.apiBase = base;
  render();
}

export function setDebugInit(status) {
  if (!IS_LOCAL) return;
  state.init = status;
  render();
}

export function setDebugEngine(info) {
  if (!IS_LOCAL) return;
  state.engine = info;
  render();
}

export function setDebugPosition(sfen, moves) {
  if (!IS_LOCAL) return;
  state.sfen = sfen;
  state.moves = moves.length ? moves.join(' ') : '(none)';
  render();
}

export function setDebugError(message) {
  if (!IS_LOCAL) return;
  state.lastError = message || '';
  render();
}

export function mountDebugPanel() {
  if (!IS_LOCAL || panelEl) return;

  document.body.classList.add('debug-mode');

  panelEl = document.createElement('aside');
  panelEl.id = 'debug-panel';
  panelEl.className = 'debug-panel collapsed';
  panelEl.innerHTML = `
    <div class="debug-panel-header">
      <strong>開発デバッグ</strong>
      <button type="button" id="debug-toggle" class="debug-toggle">開く</button>
    </div>
    <dl class="debug-panel-body"></dl>
  `;

  document.body.appendChild(panelEl);

  panelEl.querySelector('#debug-toggle')?.addEventListener('click', () => {
    panelEl?.classList.toggle('collapsed');
    const collapsed = panelEl?.classList.contains('collapsed');
    document.body.classList.toggle('debug-expanded', !collapsed);
    const btn = panelEl?.querySelector('#debug-toggle');
    if (btn) btn.textContent = collapsed ? '開く' : '閉じる';
    window.dispatchEvent(new Event('aisyougi:relayout'));
  });

  render();
}

function render() {
  if (!panelEl) return;
  const body = panelEl.querySelector('.debug-panel-body');
  if (!body) return;

  const rows = [
    ['Init', state.init],
    ['API', state.apiBase],
    ['Engine', state.engine],
    ['SFEN', state.sfen],
    ['USI moves', state.moves],
    ['Error', state.lastError || '(none)'],
  ];

  body.innerHTML = rows.map(
    ([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`,
  ).join('');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function installGlobalErrorHandlers() {
  if (!IS_LOCAL) return;

  window.addEventListener('error', (event) => {
    setDebugError(event.message || 'Unknown error');
    setDebugInit('FAILED');
    showBootError(event.message || 'JavaScript error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason);
    setDebugError(msg);
    setDebugInit('FAILED');
    showBootError(msg);
  });
}

function showBootError(message) {
  let el = document.getElementById('boot-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'boot-error';
    el.className = 'boot-error';
    document.body.prepend(el);
  }
  el.textContent = `起動エラー: ${message}（F12 Console も確認してください）`;
}
