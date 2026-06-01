import { SHORTS_SELECTORS, SHORTS_URL_PREFIX } from './selectors';

const STYLE_ID = 'ytblocker-shorts-style';

export function installShortsBlocker(): void {
  injectHidingStyle();
  redirectIfOnShorts();

  // YouTube is a SPA — these events fire on client-side navigation.
  // popstate is the standard fallback for back/forward.
  window.addEventListener('yt-navigate-start', redirectIfOnShorts);
  window.addEventListener('yt-navigate-finish', redirectIfOnShorts);
  window.addEventListener('popstate', redirectIfOnShorts);
}

function injectHidingStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = SHORTS_SELECTORS
    .map((sel) => `${sel}{display:none!important;}`)
    .join('');
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  // documentElement (not body) — body may not exist yet at document_start.
  document.documentElement.appendChild(style);
}

function redirectIfOnShorts(): void {
  if (location.pathname.startsWith(SHORTS_URL_PREFIX)) {
    location.replace('/');
  }
}
