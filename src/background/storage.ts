import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  type AllowlistChannel,
  type Settings,
} from '@/src/shared/types';

const KEY = 'settings';

type RawAllowlist = AllowlistChannel[] | string[] | undefined;

type PartialSettings = {
  enabled?: boolean;
  shorts?: Partial<Settings['shorts']>;
  feedFilter?: Omit<Partial<Settings['feedFilter']>, 'allowlist'> & {
    allowlist?: RawAllowlist;
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
  return {
    enabled: partial.enabled ?? defaults.enabled,
    shorts: { ...defaults.shorts, ...partial.shorts },
    feedFilter: {
      enabled: partial.feedFilter?.enabled ?? defaults.feedFilter.enabled,
      allowlist: normalizeAllowlist(partial.feedFilter?.allowlist),
      blocklist: partial.feedFilter?.blocklist ?? defaults.feedFilter.blocklist,
      strictness:
        partial.feedFilter?.strictness ?? defaults.feedFilter.strictness,
    },
    claude: { ...defaults.claude, ...partial.claude },
  };
}

function normalizeAllowlist(raw: RawAllowlist): AllowlistChannel[] {
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
