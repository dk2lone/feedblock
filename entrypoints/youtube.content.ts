import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import { getSettings, onSettingsChanged } from '@/src/background/storage';
import {
  installShortsBlocker,
  uninstallShortsBlocker,
} from '@/src/sites/youtube/shorts';
import {
  installFeedFilter,
  uninstallFeedFilter,
} from '@/src/sites/youtube/feedFilter';
import {
  installSearchHistoryHider,
  uninstallSearchHistoryHider,
} from '@/src/sites/youtube/searchHistory';
import type { Settings } from '@/src/shared/types';

export interface DetectedChannel {
  id: string | null;
  handle: string | null;
  displayName: string;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  async main() {
    // Inject CSS immediately so Shorts hide on first paint for the common case
    // (extension on, Shorts blocker on). We undo this below if settings say
    // otherwise — slight flash of "no Shorts" is preferable to a flash of Shorts.
    installShortsBlocker();
    installSearchHistoryHider();

    apply(await getSettings());
    onSettingsChanged(apply);

    browser.runtime.onMessage.addListener(
      (msg: unknown): Promise<DetectedChannel | null> | undefined => {
        if (isGetCurrentChannel(msg)) {
          return Promise.resolve(getCurrentChannelFromPage());
        }
        return undefined;
      },
    );
  },
});

function apply(settings: Settings): void {
  if (settings.enabled && settings.shorts.enabled) {
    installShortsBlocker();
  } else {
    uninstallShortsBlocker();
  }

  if (settings.enabled) {
    installSearchHistoryHider();
  } else {
    uninstallSearchHistoryHider();
  }

  if (settings.enabled && settings.feedFilter.enabled) {
    installFeedFilter(
      settings.feedFilter.allowlist,
      settings.feedFilter.blocklist,
      settings.claude.enabled && settings.claude.apiKey.length > 0,
    );
  } else {
    uninstallFeedFilter();
  }
}

function isGetCurrentChannel(msg: unknown): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'getCurrentChannel'
  );
}

function getCurrentChannelFromPage(): DetectedChannel | null {
  const path = location.pathname;

  if (path.startsWith('/watch')) {
    const link = document.querySelector<HTMLAnchorElement>(
      'ytd-video-owner-renderer a[href^="/@"], ytd-video-owner-renderer a[href^="/channel/"], #owner #channel-name a, #upload-info #channel-name a',
    );
    if (!link) return null;
    return fromLink(link);
  }

  if (path.startsWith('/@')) {
    const handle = (path.slice(2).split(/[/?#]/)[0] ?? '').toLowerCase();
    if (!handle) return null;
    return {
      id: extractChannelIdFromPage(),
      handle,
      displayName: readChannelDisplayName() || `@${handle}`,
    };
  }

  if (path.startsWith('/channel/')) {
    const id = path.slice('/channel/'.length).split(/[/?#]/)[0] ?? '';
    if (!id) return null;
    return {
      id,
      handle: extractHandleFromPage(),
      displayName: readChannelDisplayName() || id,
    };
  }

  return null;
}

function fromLink(link: HTMLAnchorElement): DetectedChannel | null {
  const href = link.getAttribute('href') ?? '';
  const displayName = (link.textContent ?? '').trim();
  if (href.startsWith('/@')) {
    const handle = (href.slice(2).split(/[/?#]/)[0] ?? '').toLowerCase();
    if (!handle) return null;
    return { id: null, handle, displayName: displayName || `@${handle}` };
  }
  if (href.startsWith('/channel/')) {
    const id = href.slice('/channel/'.length).split(/[/?#]/)[0] ?? '';
    if (!id) return null;
    return { id, handle: null, displayName: displayName || id };
  }
  return null;
}

function readChannelDisplayName(): string {
  const selectors = [
    'yt-formatted-string.ytd-channel-name#text',
    '#channel-header #text',
    '#channel-name #text',
    'ytd-channel-name yt-formatted-string',
    'meta[property="og:title"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const value =
      el.tagName === 'META'
        ? (el as HTMLMetaElement).content
        : (el.textContent ?? '');
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function extractChannelIdFromPage(): string | null {
  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (canonical?.href) {
    const m = canonical.href.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);
    if (m?.[1]) return m[1];
  }
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[itemprop="identifier"], meta[itemprop="channelId"]',
  );
  const content = meta?.content?.trim();
  if (content && /^UC[A-Za-z0-9_-]{20,}$/.test(content)) return content;
  return null;
}

function extractHandleFromPage(): string | null {
  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (canonical?.href) {
    const m = canonical.href.match(/\/@([A-Za-z0-9._-]+)/);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}
