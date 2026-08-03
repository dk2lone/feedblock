const STYLE_ID = 'feedblock-reddit-style';
const NUKE_ATTR = 'data-feedblock-reddit';
const POLL_MS = 500;

let active = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPath = '';

export function installRedditBlocker(): void {
  active = true;
  injectStyle();
  syncAttr();
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (location.pathname !== lastPath) syncAttr();
    }, POLL_MS);
  }
}

export function uninstallRedditBlocker(): void {
  active = false;
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.removeAttribute(NUKE_ATTR);
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Hide the feed element on home/popular/all; leave post pages untouched.
  style.textContent =
    `html[${NUKE_ATTR}] shreddit-feed{display:none!important;}` +
    `html[${NUKE_ATTR}] faceplate-batch{display:none!important;}`;
  document.documentElement.appendChild(style);
}

function isFeedPath(path: string): boolean {
  if (path === '/' || path === '') return true;
  return /^\/r\/(popular|all)(\/|$)/.test(path);
}

function syncAttr(): void {
  if (!active) return;
  lastPath = location.pathname;
  if (isFeedPath(lastPath)) {
    document.documentElement.setAttribute(NUKE_ATTR, '');
  } else {
    document.documentElement.removeAttribute(NUKE_ATTR);
  }
}
