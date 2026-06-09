import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { getSettings, setSettings } from '@/src/background/storage';
import { classify, type Verdict } from '@/src/background/classifier';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel } from '@/src/shared/types';

const SEED_HANDLES = ['khanacademy', 'amoebasisters', 'briancasel'];
const SEED_FLAG_KEY = 'seedAttempted';

const ACTIVE_HOSTS = ['youtube.com', 'instagram.com'];
const IDLE_ICON = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
};
const ACTIVE_ICON = {
  16: 'icon/active/16.png',
  32: 'icon/active/32.png',
  48: 'icon/active/48.png',
  96: 'icon/active/96.png',
  128: 'icon/active/128.png',
};

function isActiveHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return ACTIVE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function updateIconForTab(tabId: number, url: string | undefined): Promise<void> {
  const path = isActiveHost(url) ? ACTIVE_ICON : IDLE_ICON;
  try {
    await browser.action.setIcon({ tabId, path });
  } catch (err) {
    console.warn('[feedblock] setIcon failed', err);
  }
}

export interface ClassifyMessage {
  type: 'classify';
  videoId: string;
  title: string;
  channelName: string;
}

export default defineBackground(() => {
  console.log('[feedblock] background service worker active');

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'install' && details.reason !== 'update') return;
    const stored = await browser.storage.local.get(SEED_FLAG_KEY);
    if (stored[SEED_FLAG_KEY]) return;
    await seedAllowlist();
    await browser.storage.local.set({ [SEED_FLAG_KEY]: true });
  });

  browser.runtime.onMessage.addListener(
    (msg: unknown): Promise<Verdict> | undefined => {
      if (!isClassifyMessage(msg)) return undefined;
      return classify(msg.videoId, msg.title, msg.channelName);
    },
  );

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'loading') {
      void updateIconForTab(tabId, changeInfo.url ?? tab.url);
    }
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await browser.tabs.get(tabId);
      await updateIconForTab(tabId, tab.url);
    } catch {
      /* tab closed before lookup */
    }
  });

  void (async () => {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (typeof tab.id === 'number') {
        await updateIconForTab(tab.id, tab.url);
      }
    }
  })();
});

function isClassifyMessage(msg: unknown): msg is ClassifyMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'classify' &&
    typeof (msg as { videoId?: unknown }).videoId === 'string' &&
    typeof (msg as { title?: unknown }).title === 'string' &&
    typeof (msg as { channelName?: unknown }).channelName === 'string'
  );
}

async function seedAllowlist(): Promise<void> {
  const settings = await getSettings();
  if (settings.feedFilter.allowlist.length > 0) return;

  const resolved: AllowlistChannel[] = [];
  for (const handle of SEED_HANDLES) {
    const result = await resolveHandle(handle);
    if (result.ok) {
      resolved.push(result.channel);
    } else {
      console.warn(`[feedblock] failed to seed @${handle}: ${result.reason}`);
    }
  }

  if (resolved.length === 0) return;
  await setSettings({
    ...settings,
    feedFilter: { ...settings.feedFilter, allowlist: resolved },
  });
  console.log(`[feedblock] seeded ${resolved.length} channel(s)`);
}
