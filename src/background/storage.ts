import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from '@/src/shared/types';

const KEY = 'settings';

type PartialSettings = {
  [K in keyof Settings]?: Partial<Settings[K]>;
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
    feedFilter: { ...defaults.feedFilter, ...partial.feedFilter },
    claude: { ...defaults.claude, ...partial.claude },
  };
}
