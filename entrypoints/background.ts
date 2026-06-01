import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { getSettings, setSettings } from '@/src/background/storage';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel } from '@/src/shared/types';

const SEED_HANDLES = ['khanacademy', 'amoebasisters', 'briancasel'];
const SEED_FLAG_KEY = 'seedAttempted';

export default defineBackground(() => {
  console.log('[ytblocker] background service worker active');

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'install' && details.reason !== 'update') return;
    const stored = await browser.storage.local.get(SEED_FLAG_KEY);
    if (stored[SEED_FLAG_KEY]) return;
    await seedAllowlist();
    await browser.storage.local.set({ [SEED_FLAG_KEY]: true });
  });
});

async function seedAllowlist(): Promise<void> {
  const settings = await getSettings();
  if (settings.feedFilter.allowlist.length > 0) return;

  const resolved: AllowlistChannel[] = [];
  for (const handle of SEED_HANDLES) {
    const result = await resolveHandle(handle);
    if (result.ok) {
      resolved.push(result.channel);
    } else {
      console.warn(`[ytblocker] failed to seed @${handle}: ${result.reason}`);
    }
  }

  if (resolved.length === 0) return;
  await setSettings({
    ...settings,
    feedFilter: { ...settings.feedFilter, allowlist: resolved },
  });
  console.log(`[ytblocker] seeded ${resolved.length} channel(s)`);
}
