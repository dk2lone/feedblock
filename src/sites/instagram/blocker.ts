import { ALWAYS_HIDE_SELECTORS, nukeModeForPath } from './selectors';

const STYLE_ID = 'feedblock-instagram-style';
const NUKE_ATTR = 'data-feedblock-nuke';
const POLL_MS = 500;

type ActiveMode = 'partial' | 'full';

let listenersAttached = false;
let activeMode: ActiveMode | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPath = '';

/**
 * Install or update the Instagram blocker.
 *
 * - 'partial': blank specific surfaces (home feed, explore, bare reels). DMs,
 *   profiles, posts, search, and single reels still render.
 * - 'full': blank every page on instagram.com.
 *
 * Idempotent — call again with a different mode to switch.
 */
export function installInstagramBlocker(mode: ActiveMode = 'partial'): void {
  activeMode = mode;
  injectHidingStyle();
  if (mode === 'full') {
    document.documentElement.setAttribute(NUKE_ATTR, 'all');
    return;
  }
  // partial — needs path-aware sync.
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
  activeMode = null;
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(NUKE_ATTR);
  // popstate listener and poll stay attached; they no-op via the `activeMode`
  // check in syncNukeAttr. Re-installing is cheap.
}

function injectHidingStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const alwaysHide = ALWAYS_HIDE_SELECTORS
    .map((sel) => `${sel}{display:none!important;}`)
    .join('');
  // 'posts' (home): hide individual post articles only. Stories strip and
  // sidebar nav (also inside <main> on the home layout) survive.
  // 'full' (explore, reels): blank <main> entirely.
  // 'all' (full-block mode, every path): blank <body>.
  const nukeRules =
    `html[${NUKE_ATTR}="posts"] main article{display:none!important;}` +
    `html[${NUKE_ATTR}="full"] main{display:none!important;}` +
    `html[${NUKE_ATTR}="all"] body{display:none!important;}`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = alwaysHide + nukeRules;
  document.documentElement.appendChild(style);
}

function syncNukeAttr(): void {
  if (activeMode !== 'partial') return;
  lastPath = location.pathname;
  const mode = nukeModeForPath(lastPath);
  if (mode === null) {
    document.documentElement.removeAttribute(NUKE_ATTR);
  } else {
    document.documentElement.setAttribute(NUKE_ATTR, mode);
  }
}
