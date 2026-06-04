import { browser } from 'wxt/browser';
import type { AllowlistChannel } from '@/src/shared/types';
import type { Verdict } from '@/src/background/classifier';

const STYLE_ID = 'ytblocker-feedfilter-style';
const HIDE_CLASS = 'ytblocker-feed-hidden';
const CHECK_CLASS = 'ytblocker-feed-checking';
const TILE_HOME = 'ytd-rich-item-renderer';
const TILE_UPNEXT = 'ytd-compact-video-renderer, yt-lockup-view-model';
const SHELF_HOME = 'ytd-rich-section-renderer, ytd-rich-shelf-renderer';
const GUIDE_ENTRY = 'ytd-guide-entry-renderer';
const CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"]';

let active = false;
let idSet = new Set<string>();
let handleSet = new Set<string>();
let blockIdSet = new Set<string>();
let blockHandleSet = new Set<string>();
let claudeEnabled = false;
let observer: MutationObserver | null = null;
let pending = false;
// Per-page-load dedupe so we don't fire concurrent classify requests for the
// same video while one is already in flight.
const pendingClassifications = new Set<string>();
// Per-page-load verdict cache. The background also caches in storage, but
// keeping a content-script copy lets us short-circuit before sending any
// runtime message — critical because scan() fires many times/sec from
// YouTube's own DOM mutations, and re-IPC for already-classified videos
// causes a CHECK_CLASS-add/remove flicker loop.
const localVerdicts = new Map<string, 'pass' | 'block'>();

export function installFeedFilter(
  allowlist: AllowlistChannel[],
  blocklist: AllowlistChannel[],
  useClaude: boolean,
): void {
  active = true;
  idSet = new Set(allowlist.map((c) => c.id).filter((id) => id.length > 0));
  handleSet = new Set(allowlist.map((c) => c.handle.toLowerCase()));
  blockIdSet = new Set(blocklist.map((c) => c.id).filter((id) => id.length > 0));
  blockHandleSet = new Set(blocklist.map((c) => c.handle.toLowerCase()));
  claudeEnabled = useClaude;
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
    .querySelectorAll(`.${HIDE_CLASS}, .${CHECK_CLASS}`)
    .forEach((el) => {
      el.classList.remove(HIDE_CLASS);
      el.classList.remove(CHECK_CLASS);
    });
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
  // Tiles awaiting Claude verdict — visible but with a subtle pulse so the user
  // knows something's pending.
  const checking =
    `.${CHECK_CLASS}{position:relative;}` +
    `.${CHECK_CLASS}::after{` +
    `content:"checking…";` +
    `position:absolute;top:8px;left:8px;z-index:10;` +
    `background:rgba(0,0,0,0.7);color:#fff;` +
    `font:500 11px/1 -apple-system,system-ui,sans-serif;` +
    `padding:4px 8px;border-radius:4px;` +
    `pointer-events:none;` +
    `animation:ytblocker-pulse 1.2s ease-in-out infinite;` +
    `}` +
    `@keyframes ytblocker-pulse{` +
    `0%,100%{opacity:0.7;}50%{opacity:1;}` +
    `}`;
  // Nuke the entire watch-page Up Next sidebar when filter is on, regardless
  // of allowlist contents.
  const hideUpNext =
    `html[data-ytblocker-path="watch"] ytd-watch-next-secondary-results-renderer` +
    `{display:none!important;}`;
  if (idSet.size === 0 && handleSet.size === 0) {
    return (
      hideMatched +
      checking +
      hideUpNext +
      `html[data-ytblocker-path="home"] ytd-rich-section-renderer,` +
      `html[data-ytblocker-path="home"] ytd-rich-shelf-renderer,` +
      `html[data-ytblocker-path="home"] ${TILE_HOME}{display:none!important;}`
    );
  }
  return hideMatched + checking + hideUpNext;
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
    tile.classList.remove(CHECK_CLASS);
    return;
  }
  const channel = extractChannel(tile);

  // Blocklist beats everything — instant hide.
  if (channel && isInSet(channel, blockIdSet, blockHandleSet)) {
    tile.classList.add(HIDE_CLASS);
    tile.classList.remove(CHECK_CLASS);
    return;
  }

  // Allowlist match — instant show.
  if (channel && isInSet(channel, idSet, handleSet)) {
    tile.classList.remove(HIDE_CLASS);
    tile.classList.remove(CHECK_CLASS);
    return;
  }

  // No list match. If Claude is off, fall back to Stage 4's default-hide.
  if (!claudeEnabled) {
    tile.classList.add(HIDE_CLASS);
    tile.classList.remove(CHECK_CLASS);
    return;
  }

  const video = extractVideoInfo(tile, channel);
  if (!video) {
    // Can't read metadata (still rendering, or a Mix/ad with no video link).
    // Default-block matches the user's strict ambiguity preference.
    tile.classList.add(HIDE_CLASS);
    tile.classList.remove(CHECK_CLASS);
    return;
  }

  // Already classified in this page session — apply verdict directly, no IPC.
  const known = localVerdicts.get(video.id);
  if (known) {
    tile.classList.remove(CHECK_CLASS);
    if (known === 'block') tile.classList.add(HIDE_CLASS);
    else tile.classList.remove(HIDE_CLASS);
    return;
  }

  if (pendingClassifications.has(video.id)) return;
  pendingClassifications.add(video.id);
  tile.classList.remove(HIDE_CLASS);
  tile.classList.add(CHECK_CLASS);

  void browser.runtime
    .sendMessage({
      type: 'classify',
      videoId: video.id,
      title: video.title,
      channelName: video.channelName,
    })
    .then((verdict) => {
      pendingClassifications.delete(video.id);
      const v = verdict as Verdict;
      if (v === 'pass' || v === 'block') {
        localVerdicts.set(video.id, v);
      }
      tile.classList.remove(CHECK_CLASS);
      // Strict default: only 'pass' shows. 'block' and 'error' both hide so
      // missing/invalid API keys and transient API failures don't leak
      // entertainment. Errors aren't cached, so the next page load retries.
      if (v === 'pass') {
        tile.classList.remove(HIDE_CLASS);
      } else {
        tile.classList.add(HIDE_CLASS);
      }
    });
}

function isInSet(
  channel: { id: string | null; handle: string | null },
  ids: Set<string>,
  handles: Set<string>,
): boolean {
  if (channel.id && ids.has(channel.id)) return true;
  if (channel.handle && handles.has(channel.handle)) return true;
  return false;
}

function extractVideoInfo(
  tile: HTMLElement,
  channel: { id: string | null; handle: string | null } | null,
): { id: string; title: string; channelName: string } | null {
  const link = tile.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]');
  if (!link) return null;
  const href = link.getAttribute('href') ?? '';
  const id = href.match(/[?&]v=([\w-]+)/)?.[1];
  if (!id) return null;

  // YouTube's modern grid uses different IDs across layouts; the link's
  // `title` attribute is the most stable signal we've seen across versions.
  const title = (
    link.getAttribute('title') ||
    tile.querySelector<HTMLElement>('#video-title-link')?.textContent ||
    tile.querySelector<HTMLElement>('#video-title')?.textContent ||
    tile.querySelector<HTMLElement>('h3')?.textContent ||
    ''
  ).trim();
  if (!title) return null;

  // Byline link text is the display name; fall back to the handle we
  // already extracted if the text content is empty.
  const bylineText = tile
    .querySelector<HTMLElement>(CHANNEL_LINK)
    ?.textContent?.trim();
  const channelName = bylineText || channel?.handle || '';
  if (!channelName) return null;

  return { id, title, channelName };
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
