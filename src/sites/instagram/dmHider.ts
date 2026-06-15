const STYLE_ID = 'feedblock-ig-dm-hider';
const POLL_MS = 800;

let hiddenNames: string[] = [];
let observer: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPath = '';

export function installDmHider(contacts: string[]): void {
  hiddenNames = contacts.map((n) => n.toLowerCase());
  if (hiddenNames.length === 0) {
    uninstallDmHider();
    return;
  }
  injectStyle();
  scanAndHide();
  if (!observer) {
    observer = new MutationObserver(() => scanAndHide());
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        scanAndHide();
      }
    }, POLL_MS);
  }
}

export function uninstallDmHider(): void {
  hiddenNames = [];
  observer?.disconnect();
  observer = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.getElementById(STYLE_ID)?.remove();
  document.querySelectorAll('[data-feedblock-dm-hidden]').forEach((el) => {
    (el as HTMLElement).style.display = '';
    el.removeAttribute('data-feedblock-dm-hidden');
  });
  document.querySelectorAll('[data-feedblock-dm-blocked]').forEach((el) => {
    el.remove();
  });
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '[data-feedblock-dm-hidden]{display:none!important;}' +
    '[data-feedblock-dm-blocked]{position:absolute;inset:0;display:flex;align-items:center;' +
    'justify-content:center;background:var(--ig-primary-background,#fff);z-index:9999;' +
    'font-size:14px;color:#8e8e8e;pointer-events:none;}';
  (document.head || document.documentElement).appendChild(style);
}

function scanAndHide(): void {
  if (hiddenNames.length === 0) return;
  hideInboxRows();
  hideThreadView();
}

function hideInboxRows(): void {
  if (!location.pathname.startsWith('/direct')) return;
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/direct/t/"]');
  for (const link of links) {
    const row = link.closest('[role="listitem"], [role="row"]') || link.closest('div > div > div') || link;
    if (row.hasAttribute('data-feedblock-dm-hidden')) continue;
    const text = (row.textContent || '').toLowerCase();
    if (hiddenNames.some((name) => text.includes(name))) {
      (row as HTMLElement).setAttribute('data-feedblock-dm-hidden', '');
    }
  }
}

function hideThreadView(): void {
  const match = location.pathname.match(/^\/direct\/t\/(\w+)/);
  if (!match) return;

  const header = document.querySelector('header') ||
    document.querySelector('[role="banner"]') ||
    document.querySelector('section > div > div > div > div');
  if (!header) return;

  const headerText = (header.textContent || '').toLowerCase();
  const isHidden = hiddenNames.some((name) => headerText.includes(name));

  if (!isHidden) return;

  const main = document.querySelector('section[role="main"], main, [role="main"]');
  if (!main) return;

  const messageArea = main.querySelector('[role="grid"], [role="list"]')?.parentElement || main;
  if (!messageArea.querySelector('[data-feedblock-dm-blocked]')) {
    const existing = messageArea.querySelectorAll(':scope > *');
    existing.forEach((el) => {
      if (!(el as HTMLElement).hasAttribute('data-feedblock-dm-hidden') &&
          !(el as HTMLElement).hasAttribute('data-feedblock-dm-blocked')) {
        (el as HTMLElement).setAttribute('data-feedblock-dm-hidden', '');
      }
    });
    (messageArea as HTMLElement).style.position = 'relative';
    const overlay = document.createElement('div');
    overlay.setAttribute('data-feedblock-dm-blocked', '');
    overlay.textContent = 'This conversation is hidden by feedblock';
    messageArea.appendChild(overlay);
  }

  const forms = document.querySelectorAll('form, [role="textbox"], textarea, [contenteditable="true"]');
  forms.forEach((el) => {
    const closest = (el as HTMLElement).closest('section, main, [role="main"]');
    if (closest === main) {
      (el as HTMLElement).setAttribute('data-feedblock-dm-hidden', '');
    }
  });
}
