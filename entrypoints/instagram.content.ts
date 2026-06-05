import { defineContentScript } from '#imports';
import { getSettings, onSettingsChanged } from '@/src/background/storage';
import {
  installInstagramBlocker,
  uninstallInstagramBlocker,
} from '@/src/sites/instagram/blocker';
import type { Settings } from '@/src/shared/types';

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  runAt: 'document_start',
  async main() {
    // Inject CSS immediately so the feed/Reels hide on first paint for the
    // common case (extension on, short-form-video blocker on). Undone below
    // if settings say otherwise — a flash of "blank" is preferable to a
    // flash of feed.
    installInstagramBlocker();

    apply(await getSettings());
    onSettingsChanged(apply);
  },
});

function apply(settings: Settings): void {
  if (settings.enabled && settings.shortFormVideo.enabled) {
    installInstagramBlocker();
  } else {
    uninstallInstagramBlocker();
  }
}
