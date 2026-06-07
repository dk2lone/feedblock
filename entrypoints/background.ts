import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { getSettings, setSettings } from '@/src/background/storage';
import { classify, type Verdict } from '@/src/background/classifier';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel } from '@/src/shared/types';

const SEED_HANDLES = ['khanacademy', 'amoebasisters', 'briancasel'];
const SEED_FLAG_KEY = 'seedAttempted';

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
