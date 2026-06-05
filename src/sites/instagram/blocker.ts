import { ALWAYS_HIDE_SELECTORS, nukeModeForPath } from './selectors';

const STYLE_ID = 'feedblock-instagram-style';
const NUKE_ATTR = 'data-feedblock-nuke';
const POLL_MS = 500;
let listenersAttached = false;
let active = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPath = '';

export function installInstagramBlocker(): void {
  active = true;
  injectHidingStyle();
  syncNukeAttr();
  if (!listenersAttached) {
    // popstate catches back/forward. We don't patch pushState because
    // Instagram's React stack tends to override history methods after our
    // content script runs at document_start, defeating the patch and leaving
    // the nuke attribute stale (symptom: posts reappear on home after
    // viewing a single reel and returning). The poll below is the reliable
    // backstop — it picks up every SPA nav regardless of mechanism.
    window.addEventListener('popstate', syncNukeAttr);
    pollTimer = setInterval(() => {
      if (location.pathname !== lastPath) syncNukeAttr();
    }, POLL_MS);
    listenersAttached = true;
  }
}

export function uninstallInstagramBlocker(): void {
  active = false;
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(NUKE_ATTR);
  // popstate listener and poll stay attached; they no-op via the `active`
  // flag. Re-installing is cheap.
}

function injectHidingStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const alwaysHide = ALWAYS_HIDE_SELECTORS
    .map((sel) => `${sel}{display:none!important;}`)
    .join('');
  // 'posts' (home): hide individual post articles only. Stories strip and
  // sidebar nav (also inside <main> on the home layout) survive.
  // 'full' (explore, reels): blank <main> entirely.
  const nukeRules =
    `html[${NUKE_ATTR}="posts"] main article{display:none!important;}` +
    `html[${NUKE_ATTR}="full"] main{display:none!important;}`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = alwaysHide + nukeRules;
  document.documentElement.appendChild(style);
}

function syncNukeAttr(): void {
  if (!active) return;
  lastPath = location.pathname;
  const mode = nukeModeForPath(lastPath);
  if (mode === null) {
    document.documentElement.removeAttribute(NUKE_ATTR);
  } else {
    document.documentElement.setAttribute(NUKE_ATTR, mode);
  }
}
