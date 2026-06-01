import { defineContentScript } from '#imports';
import { installShortsBlocker } from '@/src/sites/youtube/shorts';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_start',
  main() {
    installShortsBlocker();
  },
});
