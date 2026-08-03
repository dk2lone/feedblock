import { SHORTS_SELECTORS, SHORTS_URL_PREFIX } from './selectors';

const STYLE_ID = 'feedblock-shorts-style';
let listenersAttached = false;
let active = false;

export function installShortsBlocker(): void {
  active = true;
  injectHidingStyle();
  redirectIfOnShorts();
  if (!listenersAttached) {
    window.addEventListener('yt-navigate-start', redirectIfOnShorts);
    window.addEventListener('yt-navigate-finish', redirectIfOnShorts);
    window.addEventListener('popstate', redirectIfOnShorts);
    listenersAttached = true;
  }
}

export function uninstallShortsBlocker(): void {
  active = false;
  document.getElementById(STYLE_ID)?.remove();
  // Listeners stay attached; they no-op via the `active` flag. Re-installing
  // is cheap, and detaching/reattaching would race with SPA navigation events.
}

function injectHidingStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = SHORTS_SELECTORS
    .map((sel) => `${sel}{display:none!important;}`)
    .join('');
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);
}

function redirectIfOnShorts(): void {
  if (!active) return;
  if (location.pathname.startsWith(SHORTS_URL_PREFIX)) {
    location.replace('/');
  }
}
