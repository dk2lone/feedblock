import { defineContentScript } from '#imports';
import { getSettings, onSettingsChanged } from '@/src/background/storage';
import {
  installShortsBlocker,
  uninstallShortsBlocker,
} from '@/src/sites/youtube/shorts';
import {
  installFeedFilter,
  uninstallFeedFilter,
} from '@/src/sites/youtube/feedFilter';
import type { Settings } from '@/src/shared/types';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  async main() {
    // Inject CSS immediately so Shorts hide on first paint for the common case
    // (extension on, Shorts blocker on). We undo this below if settings say
    // otherwise — slight flash of "no Shorts" is preferable to a flash of Shorts.
    installShortsBlocker();

    apply(await getSettings());
    onSettingsChanged(apply);
  },
});

function apply(settings: Settings): void {
  if (settings.enabled && settings.shorts.enabled) {
    installShortsBlocker();
  } else {
    uninstallShortsBlocker();
  }

  if (settings.enabled && settings.feedFilter.enabled) {
    installFeedFilter(settings.feedFilter.allowlist);
  } else {
    uninstallFeedFilter();
  }
}
