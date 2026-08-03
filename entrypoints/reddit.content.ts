import { defineContentScript } from '#imports';
import { getSettings, onSettingsChanged } from '@/src/background/storage';
import {
  installRedditBlocker,
  uninstallRedditBlocker,
} from '@/src/sites/reddit/blocker';
import type { Settings } from '@/src/shared/types';

export default defineContentScript({
  matches: ['*://*.reddit.com/*'],
  runAt: 'document_start',
  async main() {
    installRedditBlocker();
    apply(await getSettings());
    onSettingsChanged(apply);
  },
});

function apply(settings: Settings): void {
  if (!settings.enabled) {
    uninstallRedditBlocker();
  } else {
    installRedditBlocker();
  }
}
