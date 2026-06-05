import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  type AllowlistChannel,
  type InstagramMode,
  type Settings,
} from '@/src/shared/types';

const KEY = 'settings';

type RawChannelList = AllowlistChannel[] | string[] | undefined;

type PartialSettings = {
  enabled?: boolean;
  shortFormVideo?: Partial<Settings['shortFormVideo']>;
  // Legacy: pre-Instagram-Reels schema used `shorts`. Read it on load only.
  shorts?: Partial<Settings['shortFormVideo']>;
  instagram?: Partial<Settings['instagram']>;
  feedFilter?: Omit<Partial<Settings['feedFilter']>, 'allowlist' | 'blocklist'> & {
    allowlist?: RawChannelList;
    blocklist?: RawChannelList;
  };
  claude?: Partial<Settings['claude']>;
};

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(KEY);
  return merge(DEFAULT_SETTINGS, (result[KEY] as PartialSettings) ?? {});
}

export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

export function onSettingsChanged(
  handler: (settings: Settings) => void,
): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>) => {
    if (changes[KEY]) {
      handler(
        merge(DEFAULT_SETTINGS, (changes[KEY].newValue as PartialSettings) ?? {}),
      );
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

function merge(defaults: Settings, partial: PartialSettings): Settings {
  const shortFormVideo = {
    ...defaults.shortFormVideo,
    ...partial.shorts,
    ...partial.shortFormVideo,
  };
  return {
    enabled: partial.enabled ?? defaults.enabled,
    shortFormVideo,
    instagram: {
      mode: resolveInstagramMode(partial, shortFormVideo.enabled),
    },
    feedFilter: {
      enabled: partial.feedFilter?.enabled ?? defaults.feedFilter.enabled,
      allowlist: normalizeChannelList(partial.feedFilter?.allowlist),
      blocklist: normalizeChannelList(partial.feedFilter?.blocklist),
      strictness:
        partial.feedFilter?.strictness ?? defaults.feedFilter.strictness,
    },
    claude: { ...defaults.claude, ...partial.claude },
  };
}

// Pre-split schema: Instagram blocking piggybacked on `shortFormVideo.enabled`.
// For users upgrading, mirror that flag into the new instagram.mode field so
// behavior doesn't change on first load.
function resolveInstagramMode(
  partial: PartialSettings,
  sfvEnabled: boolean,
): InstagramMode {
  const stored = partial.instagram?.mode;
  if (stored === 'off' || stored === 'partial' || stored === 'full') {
    return stored;
  }
  return sfvEnabled ? 'partial' : 'off';
}

function normalizeChannelList(raw: RawChannelList): AllowlistChannel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        const handle = entry.replace(/^@/, '').toLowerCase().trim();
        if (!handle) return null;
        return { id: '', handle, displayName: entry, addedAt: 0 };
      }
      if (entry && typeof entry === 'object' && typeof entry.handle === 'string') {
        return {
          id: typeof entry.id === 'string' ? entry.id : '',
          handle: entry.handle.toLowerCase(),
          displayName:
            typeof entry.displayName === 'string' ? entry.displayName : entry.handle,
          addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : 0,
        };
      }
      return null;
    })
    .filter((c): c is AllowlistChannel => c !== null);
}
