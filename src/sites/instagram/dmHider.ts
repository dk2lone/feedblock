const STYLE_ID = 'feedblock-ig-dm-hider';
const SCAN_MS = 400;

let hiddenNames: string[] = [];
let scanTimer: ReturnType<typeof setInterval> | null = null;

export function installDmHider(contacts: string[]): void {
  const names = new Set<string>();
  for (const c of contacts) {
    const lower = c.toLowerCase().replace(/^@/, '');
    names.add(lower);
    // Also match just the first part before dots/underscores
    // so "cindy.zkx" also matches display name "Cindy"
    const base = lower.split(/[._]/)[0];
    if (base) names.add(base);
  }
  hiddenNames = [...names];
  if (hiddenNames.length === 0) {
    uninstallDmHider();
    return;
  }
  injectStyle();
  // Clear old hidden markers so re-scan picks up new names
  document.querySelectorAll('[data-fb-dmh]').forEach((el) => {
    el.removeAttribute('data-fb-dmh');
  });
  if (!scanTimer) {
    scanTimer = setInterval(scan, SCAN_MS);
  }
  scan();
}

export function uninstallDmHider(): void {
  hiddenNames = [];
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  document.getElementById(STYLE_ID)?.remove();
  document.querySelectorAll('[data-fb-dmh]').forEach((el) => {
    el.removeAttribute('data-fb-dmh');
  });
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '[data-fb-dmh]{display:none!important;}';
  (document.head || document.documentElement).appendChild(style);
}

function nameMatch(text: string): boolean {
  const lower = text.toLowerCase();
  return hiddenNames.some((name) => lower.includes(name));
}

function ownText(el: Element): string {
  let t = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
      t += el.childNodes[i].textContent || '';
    }
  }
  return t;
}

function scan(): void {
  if (hiddenNames.length === 0) return;

  // 1. Hide the "Messages" floating chat bubble on any page
  hideMessagesBubble();

  // 2. Hide textbox + call buttons anywhere a hidden contact's name appears
  hideInputsNearHiddenNames();

  // 3. On /direct pages: hide inbox rows
  if (location.pathname.startsWith('/direct')) {
    hideInboxRows();
  }
}

// ── 1. The "Messages" floating bubble at bottom-right of home page ──

function hideMessagesBubble(): void {
  // Find the floating "Messages" pill at the bottom-right of the page.
  // It has a span saying "Messages" + profile avatar <img> tags.
  // Do NOT hide the "Messages" link in the left sidebar nav.
  const spans = document.querySelectorAll('span');
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.closest('[data-fb-dmh]')) continue;
    if (ownText(span).trim() !== 'Messages') continue;

    // Skip if this is inside a nav link (sidebar)
    if (span.closest('a, nav')) continue;

    // The floating bubble must have avatar <img> tags nearby
    let container: HTMLElement | null = span.parentElement;
    let found = false;
    for (let j = 0; j < 6 && container && container !== document.body; j++) {
      if (container.querySelector('img')) {
        // Confirm it's at the bottom of the viewport
        const rect = container.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 150 && rect.width < 500) {
          found = true;
          break;
        }
      }
      container = container.parentElement;
    }

    if (found && container) {
      // Walk up to the largest small-enough parent
      let best: HTMLElement = container;
      let el: HTMLElement | null = container.parentElement;
      while (el && el !== document.body) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 500 || rect.height > 500) break;
        best = el;
        el = el.parentElement;
      }
      best.setAttribute('data-fb-dmh', '');
    }
  }
}

// ── 2. Hide conversation rows in the DM inbox sidebar ──

function hideInboxRows(): void {
  const spans = document.querySelectorAll('span');
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.closest('[data-fb-dmh]')) continue;
    const text = ownText(span);
    if (!nameMatch(text)) continue;

    // Walk up to find the conversation row: the ancestor whose parent
    // has 3+ children (meaning it's a list of conversation items)
    let current: HTMLElement | null = span;
    for (let d = 0; d < 20 && current; d++) {
      const parent = current.parentElement;
      if (!parent || parent === document.body) break;
      if (parent.children.length >= 3) {
        current.setAttribute('data-fb-dmh', '');
        break;
      }
      current = parent;
    }
  }
}

// ── 3. Hide textbox + call buttons anywhere near a hidden name ──
// Works on /direct/t/ thread view, mini chat popup, anywhere.

function hideInputsNearHiddenNames(): void {
  const inputs = document.querySelectorAll(
    '[role="textbox"], [contenteditable="true"], textarea'
  );
  inputs.forEach((input) => {
    if ((input as HTMLElement).closest('[data-fb-dmh]')) return;

    // Walk up from the textbox. At each level, check if this ancestor
    // contains a hidden name AND is small enough to be a conversation
    // container (popup or thread panel), not the entire page.
    let el: HTMLElement | null = (input as HTMLElement).parentElement;
    let found = false;
    for (let i = 0; i < 20 && el && el !== document.body; i++) {
      const rect = el.getBoundingClientRect();
      // Too big = page-level container, stop looking
      if (rect.width > 1200) break;
      // Check if this conversation-sized container has a hidden name
      if (rect.width > 200 && rect.height > 200) {
        const text = (el.textContent || '').toLowerCase();
        if (hiddenNames.some((name) => text.includes(name))) {
          found = true;
          break;
        }
      }
      el = el.parentElement;
    }
    if (!found) return;

    // Hidden name found in conversation container — hide the input bar
    let target: HTMLElement = input as HTMLElement;
    for (let i = 0; i < 3; i++) {
      if (target.parentElement && target.parentElement !== document.body) {
        target = target.parentElement;
      }
    }
    if (!target.hasAttribute('data-fb-dmh')) {
      target.setAttribute('data-fb-dmh', '');
    }

    // Hide call/video buttons in the same container
    if (el) {
      el.querySelectorAll('[aria-label]').forEach((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('call') || label.includes('video') || label.includes('voice')) {
          (btn as HTMLElement).setAttribute('data-fb-dmh', '');
        }
      });
    }
  });
}
