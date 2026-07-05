/** Fit the board to the viewport by measuring real chrome height. */
export function initResponsiveLayout() {
  const root = document.documentElement;

  function measureOnce() {
    const app = document.querySelector('.app');
    if (!app) return 40;

    const top = app.querySelector('.top-section');
    const gote = app.querySelector('.gote-area');
    const sente = app.querySelector('#sente-hand');
    const controls = app.querySelector('.controls');
    const fileLabels = app.querySelector('.file-labels');
    const debug = document.getElementById('debug-panel');

    const vh = window.visualViewport?.height ?? window.innerHeight;
    const vw = window.visualViewport?.width ?? window.innerWidth;

    let chrome = app.offsetTop;
    for (const el of [top, gote, fileLabels, sente, controls, debug]) {
      if (el) chrome += el.getBoundingClientRect().height;
    }

    const gaps = 10;
    const fromHeight = (vh - chrome - gaps) / 9;
    const fromWidth = (vw - 16) / 9.2;
    return Math.max(22, Math.min(fromHeight, fromWidth));
  }

  function apply() {
    root.style.setProperty('--cell-size', '40px');
    const first = measureOnce();
    root.style.setProperty('--cell-size', `${first}px`);
    const second = measureOnce();
    root.style.setProperty('--cell-size', `${second}px`);
  }

  const schedule = () => requestAnimationFrame(apply);

  schedule();
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  window.addEventListener('aisyougi:relayout', schedule);

  return schedule;
}
