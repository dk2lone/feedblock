import type { AllowlistChannel } from '@/src/shared/types';

const STYLE_ID = 'ytblocker-feedfilter-style';
const HIDE_CLASS = 'ytblocker-feed-hidden';
const TILE_HOME = 'ytd-rich-item-renderer';
const TILE_UPNEXT = 'ytd-compact-video-renderer, yt-lockup-view-model';
const SHELF_HOME = 'ytd-rich-section-renderer, ytd-rich-shelf-renderer';
const GUIDE_ENTRY = 'ytd-guide-entry-renderer';
const CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"]';

let active = false;
let idSet = new Set<string>();
let handleSet = new Set<string>();
let observer: MutationObserver | null = null;
let pending = false;

export function installFeedFilter(allowlist: AllowlistChannel[]): void {
  active = true;
  idSet = new Set(allowlist.map((c) => c.id).filter((id) => id.length > 0));
  handleSet = new Set(allowlist.map((c) => c.handle.toLowerCase()));
  injectStyle();
  if (!observer) {
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
  scan();
}

export function uninstallFeedFilter(): void {
  active = false;
  document.getElementById(STYLE_ID)?.remove();
  document
    .querySelectorAll(`.${HIDE_CLASS}`)
    .forEach((el) => el.classList.remove(HIDE_CLASS));
  // Observer stays attached; scan() no-ops via `active`. Same pattern as Shorts.
}

function injectStyle(): void {
  const existing = document.getElementById(STYLE_ID);
  const css = buildCss();
  if (existing) {
    existing.textContent = css;
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);
}

function buildCss(): string {
  const hideMatched = `.${HIDE_CLASS}{display:none!important;}`;
  // Nuke the entire watch-page Up Next sidebar when filter is on, regardless
  // of allowlist contents.
  const hideUpNext =
    `html[data-ytblocker-path="watch"] ytd-watch-next-secondary-results-renderer` +
    `{display:none!important;}`;
  if (idSet.size === 0 && handleSet.size === 0) {
    return (
      hideMatched +
      hideUpNext +
      `html[data-ytblocker-path="home"] ytd-rich-section-renderer,` +
      `html[data-ytblocker-path="home"] ytd-rich-shelf-renderer,` +
      `html[data-ytblocker-path="home"] ${TILE_HOME}{display:none!important;}`
    );
  }
  return hideMatched + hideUpNext;
}

function scheduleScan(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    scan();
  });
}

function scan(): void {
  if (!active) return;
  // The left-nav subscription list is present on every page, so always scan it.
  scanGuideEntries();

  const surface = currentSurface();
  document.documentElement.dataset.ytblockerPath = surface ?? '';
  if (!surface) return;

  if (surface === 'home') {
    // Shelves can wrap single-channel groupings ("From Khan Academy") that we
    // want to keep, but also non-channel content (Playables, Mixes) we don't.
    const shelves = document.querySelectorAll<HTMLElement>(SHELF_HOME);
    for (const shelf of shelves) applyShelf(shelf);
  }

  const selector = surface === 'home' ? TILE_HOME : TILE_UPNEXT;
  const tiles = document.querySelectorAll<HTMLElement>(selector);
  for (const tile of tiles) {
    applyTile(tile);
  }
}

function applyShelf(shelf: HTMLElement): void {
  if (idSet.size === 0 && handleSet.size === 0) {
    // Empty-allowlist nuke is in CSS; leave the class alone.
    return;
  }
  const links = shelf.querySelectorAll<HTMLAnchorElement>(CHANNEL_LINK);
  if (links.length === 0) {
    // Playables, generic promotional shelves — no channel info, hide.
    shelf.classList.add(HIDE_CLASS);
    return;
  }
  // Survive only if every channel link in the shelf is allowlisted. A Mixes
  // shelf has multiple unrelated artists and gets hidden by the first miss.
  for (const link of links) {
    const channel = linkToChannel(link);
    const matched =
      !!channel &&
      ((!!channel.id && idSet.has(channel.id)) ||
        (!!channel.handle && handleSet.has(channel.handle)));
    if (!matched) {
      shelf.classList.add(HIDE_CLASS);
      return;
    }
  }
  shelf.classList.remove(HIDE_CLASS);
}

function scanGuideEntries(): void {
  const entries = document.querySelectorAll<HTMLElement>(GUIDE_ENTRY);
  for (const entry of entries) {
    // Skip nav entries (Home, Shorts, Subscriptions link) — they don't have a
    // /@handle or /channel/ link, only subscription entries do.
    const channel = extractChannel(entry);
    if (!channel) {
      entry.classList.remove(HIDE_CLASS);
      continue;
    }
    const matched =
      (!!channel.id && idSet.has(channel.id)) ||
      (!!channel.handle && handleSet.has(channel.handle));
    if (matched) {
      entry.classList.remove(HIDE_CLASS);
    } else {
      entry.classList.add(HIDE_CLASS);
    }
  }
}

function applyTile(tile: HTMLElement): void {
  // Empty allowlist case is handled by CSS, no need to mark individual tiles.
  if (idSet.size === 0 && handleSet.size === 0) {
    tile.classList.remove(HIDE_CLASS);
    return;
  }
  // Default to hidden: Mixes, ads, and channel-less tiles must not slip through.
  // The observer re-scans on every mutation, so a tile that gets its byline
  // link added in a later tick will be re-evaluated and unhidden if matched.
  const channel = extractChannel(tile);
  const matched =
    !!channel &&
    ((!!channel.id && idSet.has(channel.id)) ||
      (!!channel.handle && handleSet.has(channel.handle)));
  if (matched) {
    tile.classList.remove(HIDE_CLASS);
  } else {
    tile.classList.add(HIDE_CLASS);
  }
}

function extractChannel(
  tile: HTMLElement,
): { id: string | null; handle: string | null } | null {
  const link = tile.querySelector<HTMLAnchorElement>(CHANNEL_LINK);
  return link ? linkToChannel(link) : null;
}

function linkToChannel(
  link: HTMLAnchorElement,
): { id: string | null; handle: string | null } | null {
  const href = link.getAttribute('href') ?? '';
  if (href.startsWith('/@')) {
    const handle = (href.slice(2).split(/[/?#]/)[0] ?? '').toLowerCase();
    return { id: null, handle: handle || null };
  }
  if (href.startsWith('/channel/')) {
    const id = href.slice('/channel/'.length).split(/[/?#]/)[0] ?? '';
    return { id: id || null, handle: null };
  }
  return null;
}

function currentSurface(): 'home' | 'watch' | null {
  const p = location.pathname;
  if (p === '/' || p === '') return 'home';
  if (p.startsWith('/watch')) return 'watch';
  return null;
}
