/** Fit the board to the viewport by measuring real chrome height. */
export function initResponsiveLayout() {
  const root = document.documentElement;
  const MIN_CELL = 20;
  const MAX_CELL = 200;

  function getSafeInsets() {
    const style = getComputedStyle(root);
    return {
      top: parseFloat(style.getPropertyValue('--safe-top')) || 0,
      bottom: parseFloat(style.getPropertyValue('--safe-bottom')) || 0,
      left: parseFloat(style.getPropertyValue('--safe-left')) || 0,
      right: parseFloat(style.getPropertyValue('--safe-right')) || 0,
    };
  }

  function getViewport() {
    const vv = window.visualViewport;
    const safe = getSafeInsets();
    const offsetTop = vv?.offsetTop ?? 0;
    const height = vv?.height ?? window.innerHeight;
    const width = vv?.width ?? window.innerWidth;
    const debug = document.getElementById('debug-panel');
    const debugH = debug?.getBoundingClientRect().height ?? 0;

    return {
      height,
      width,
      offsetTop,
      debugH,
      safe,
      /** Lowest Y coordinate (viewport) that content may extend to. */
      maxBottom: offsetTop + height - safe.bottom,
      usableWidth: width - safe.left - safe.right,
    };
  }

  /** Bottom edge of laid-out content (not the clipped .app box). */
  function getContentBottom() {
    const app = document.querySelector('.app');
    if (!app) return 0;

    let bottom = 0;
    for (const el of app.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) bottom = Math.max(bottom, r.bottom);
    }

    const debug = document.getElementById('debug-panel');
    if (debug) {
      bottom = Math.max(bottom, debug.getBoundingClientRect().bottom);
    }
    return bottom;
  }

  function getBoardWidth() {
    const row = document.querySelector('.board-row');
    if (row) return row.getBoundingClientRect().width;
    const labels = document.querySelector('.board-labels');
    return labels?.getBoundingClientRect().width ?? 0;
  }

  function setCell(cell) {
    root.style.setProperty('--cell-size', `${cell}px`);
  }

  function apply() {
    const app = document.querySelector('.app');
    if (!app) return;

    const vp = getViewport();
    const hPad = 8;

    setCell(40);

    let lo = MIN_CELL;
    let hi = Math.min(MAX_CELL, (vp.usableWidth - hPad) / 12.5);

    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      setCell(mid);

      const fitsHeight = getContentBottom() <= vp.maxBottom + 0.5;
      const fitsWidth = getBoardWidth() <= vp.usableWidth - hPad + 0.5;

      if (fitsHeight && fitsWidth) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    setCell(Math.max(MIN_CELL, Math.floor(lo)));

    // Grow into small leftover slack (desktop only).
    if (vp.usableWidth >= 640) {
      const base = parseFloat(getComputedStyle(root).getPropertyValue('--cell-size')) || lo;
      const slack = vp.maxBottom - getContentBottom();
      if (slack > 1) {
        setCell(base + slack / 9);
        if (getContentBottom() > vp.maxBottom + 0.5) {
          setCell(base);
        }
      }
    }
  }

  const schedule = () => requestAnimationFrame(apply);

  schedule();
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 100));
  window.addEventListener('load', schedule);
  window.addEventListener('aisyougi:relayout', schedule);

  const app = document.querySelector('.app');
  if (app && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(schedule);
    for (const el of [
      app.querySelector('.top-section'),
      app.querySelector('.game-area'),
      app.querySelector('.board-row'),
      app.querySelector('.hands-panel'),
      app.querySelector('.gote-area'),
      app.querySelector('#sente-hand'),
      app.querySelector('.controls'),
      document.getElementById('debug-panel'),
    ]) {
      if (el) ro.observe(el);
    }
  }

  return schedule;
}
