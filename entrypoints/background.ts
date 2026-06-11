import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { getSettings, onSettingsChanged, setSettings } from '@/src/background/storage';
import { classify, type Verdict } from '@/src/background/classifier';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel, Settings } from '@/src/shared/types';
import { getUnlockState, withGuardRestored, withTimersCleared } from '@/src/shared/unlockState';

const ALARM_UNLOCK = 'feedblock-unlock';
const ALARM_EDIT_EXPIRE = 'feedblock-edit-expire';
const ALARM_REVERT = 'feedblock-revert';

const SEED_HANDLES = ['khanacademy', 'amoebasisters', 'briancasel'];
const SEED_FLAG_KEY = 'seedAttempted';

const BUILTIN_HOSTS = ['youtube.com', 'instagram.com'];
let blockedSites: string[] = [];
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
    const all = [...BUILTIN_HOSTS, ...blockedSites];
    return all.some((h) => host === h || host.endsWith(`.${h}`));
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

  // --- Blocked sites (for icon) + unlock alarms ----------------------------
  void getSettings().then((s) => { blockedSites = s.blockedSites; });
  onSettingsChanged((s) => {
    blockedSites = s.blockedSites;
    void syncAlarms();
  });
  void syncAlarms();

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_UNLOCK) void onUnlockAlarm();
    if (alarm.name === ALARM_EDIT_EXPIRE) void onEditExpireAlarm();
    if (alarm.name === ALARM_REVERT) void onRevertAlarm();
  });
});

async function syncAlarms(): Promise<void> {
  const s = await getSettings();
  const p = s.password;
  await browser.alarms.clear(ALARM_UNLOCK);
  await browser.alarms.clear(ALARM_EDIT_EXPIRE);
  await browser.alarms.clear(ALARM_REVERT);
  if (p.unlockAt > Date.now()) {
    browser.alarms.create(ALARM_UNLOCK, { when: p.unlockAt });
  }
  if (p.editExpiresAt > Date.now()) {
    browser.alarms.create(ALARM_EDIT_EXPIRE, { when: p.editExpiresAt });
  }
  if (p.revertAt > Date.now()) {
    browser.alarms.create(ALARM_REVERT, { when: p.revertAt });
  }
}

async function onUnlockAlarm(): Promise<void> {
  await browser.notifications.create('feedblock-editing', {
    type: 'basic',
    iconUrl: 'icon/active/128.png',
    title: 'feedblock',
    message: 'Your 1-minute editing window is open. Change settings now or the cycle restarts.',
  });
}

async function onEditExpireAlarm(): Promise<void> {
  const settings: Settings = await getSettings();
  const state = getUnlockState(settings.password);
  if (state.kind === 'editing') {
    await setSettings(withTimersCleared(settings));
  }
}

async function onRevertAlarm(): Promise<void> {
  const settings: Settings = await getSettings();
  if (settings.password.revertAt === 0) return;
  if (Date.now() < settings.password.revertAt) return;
  await setSettings(withGuardRestored(settings));
}

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
